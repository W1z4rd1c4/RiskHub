"""Offline regression checks; these do not substitute for native Alpine CI."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("runtime_lock", Path(__file__).parents[1] / "runtime_dependency_lock.py")
lock = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = lock
SPEC.loader.exec_module(lock)


def package(version="1", deps=(), extras=()):
    return {"version": version, "sha256": "a" * 64, "wheel": "example-1-py3-none-any.whl",
            "requires_dist": list(deps), "provides_extra": list(extras)}


class RuntimeLockTests(unittest.TestCase):
    def test_real_repository_baseline_and_pinned_image(self):
        self.assertEqual(lock.baseline()["protobuf"], "6.33.6")
        self.assertEqual(lock.baseline()["bcrypt"], "4.1.3")
        self.assertIn("@sha256:", lock.base_image())

    def test_extras_activate_recursive_transitive_dependency(self):
        packages = {"root": package(deps=['middle[crypto]; extra == "standard"'], extras=["standard"]),
                    "middle": package(deps=['leaf; extra == "crypto"'], extras=["crypto"]), "leaf": package()}
        extras = lock.graph(packages, [lock.Requirement("root[standard]==1")], lock.MARKERS)
        self.assertEqual(extras["middle"], {"crypto"})
        self.assertIn("middle[crypto]==1 --hash=sha256:", lock.lock_text(packages, extras))

    def test_marker_selects_linux_and_python313(self):
        packages = {"root": package(deps=['leaf; sys_platform == "linux" and python_version == "3.13"',
                                         'windows-only; sys_platform == "win32"']), "leaf": package()}
        self.assertEqual(set(lock.graph(packages, [lock.Requirement("root==1")], lock.MARKERS)), {"root", "leaf"})

    def test_missing_extra_dependency_fails(self):
        with self.assertRaisesRegex(ValueError, "missing or incompatible"):
            lock.graph({"root": package(deps=['leaf; extra == "standard"'], extras=["standard"])},
                       [lock.Requirement("root[standard]==1")], lock.MARKERS)

    def test_unrelated_dev_package_fails(self):
        with self.assertRaisesRegex(ValueError, "unreachable"):
            lock.graph({"root": package(), "pytest": package()}, [lock.Requirement("root==1")], lock.MARKERS)

    def test_version_conflict_fails(self):
        with self.assertRaisesRegex(ValueError, "incompatible"):
            lock.graph({"root": package()}, [lock.Requirement("root==2")], lock.MARKERS)

    def test_unknown_extra_fails(self):
        with self.assertRaisesRegex(ValueError, "unknown requested extras"):
            lock.graph({"root": package()}, [lock.Requirement("root[typo]==1")], lock.MARKERS)

    def report(self):
        return {"version": "1", "pip_version": lock.PIP_VERSION, "environment": dict(lock.MARKERS), "install": [
            {"metadata": {"name": "pip", "version": lock.PIP_VERSION}, "is_direct": False, "is_yanked": False,
             "download_info": {"url": f"https://files.pythonhosted.org/pip-{lock.PIP_VERSION}-py3-none-any.whl",
                               "archive_info": {"hashes": {"sha256": lock.bootstrap_hash()}}}}]}

    def test_report_preserves_baseline_and_canonicalizes(self):
        result = lock.normalize_report(self.report(), "pip")
        self.assertEqual(result["packages"]["pip"]["version"], lock.PIP_VERSION)

    def test_report_rejects_unsupported_or_unsafe_artifacts(self):
        for mutation in ["sdist", "hash", "host", "upgrade", "platform", "yanked", "url", "report"]:
            report = self.report()
            item = report["install"][0]
            if mutation == "sdist":
                item["download_info"]["url"] = "https://files.pythonhosted.org/pip.tar.gz"
            elif mutation == "hash":
                item["download_info"]["archive_info"]["hashes"] = {}
            elif mutation == "host":
                item["download_info"]["url"] = "https://example.org/pip.whl"
            elif mutation == "upgrade":
                item["metadata"]["version"] = "99.0"
            elif mutation == "platform":
                report["environment"]["sys_platform"] = "darwin"
            elif mutation == "yanked":
                item["is_yanked"] = True
            elif mutation == "url":
                item["is_direct"] = True
            else:
                report["version"] = "999"
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                lock.normalize_report(report, "pip")

    def fixture(self, directory):
        lanes = {lane: {"environment": dict(lock.MARKERS), "packages": {"pip": package(lock.PIP_VERSION)}}
                 for lane in ["runtime", "dbtasks", "pip"]}
        lanes["pip"]["packages"]["pip"]["sha256"] = lock.bootstrap_hash()
        manifest = {"schema": 1, "target": lock.TARGET, "image": lock.base_image(), "pip": lock.PIP_VERSION,
                    "sources": lock.sources(), "generator_sha256": lock.digest(Path(lock.__file__)), "lanes": lanes}
        (directory / "manifest.json").write_text(json.dumps(manifest))
        for lane, data in lanes.items():
            (directory / f"requirements-{lane}.lock").write_text(lock.lock_text(data["packages"], {"pip": set()}))
        return manifest

    def test_manifest_rejects_stale_source_hash_and_wrong_platform(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            original = self.fixture(directory)
            for mutation in ["sources", "target", "image", "pip", "generator_sha256"]:
                changed = deepcopy(original)
                changed[mutation] = "wrong"
                (directory / "manifest.json").write_text(json.dumps(changed))
                with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "provenance"):
                    lock.validate(directory)

    def test_lock_rejects_missing_hash_include_or_newline_drift(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(lock, "roots_for", return_value=[lock.Requirement(f"pip=={lock.PIP_VERSION}")]):
            directory = Path(tmp)
            self.fixture(directory)
            lock.validate(directory)
            path = directory / "requirements-runtime.lock"
            original = path.read_text()
            for text in [original.rstrip(), original.split(" --hash")[0] + "\n", "-r requirements-dev.txt\n"]:
                path.write_text(text)
                with self.assertRaisesRegex(ValueError, "non-canonical or tampered"):
                    lock.validate(directory)

    def test_db_tasks_cannot_change_a_runtime_artifact(self):
        roots = [lock.Requirement(f"pip=={lock.PIP_VERSION}")]
        with tempfile.TemporaryDirectory() as tmp, patch.object(lock, "roots_for", return_value=roots):
            directory = Path(tmp)
            manifest = self.fixture(directory)
            data = manifest["lanes"]["dbtasks"]
            data["packages"]["pip"]["sha256"] = "b" * 64
            (directory / "manifest.json").write_text(json.dumps(manifest))
            (directory / "requirements-dbtasks.lock").write_text(
                lock.lock_text(data["packages"], {"pip": set()})
            )
            with self.assertRaisesRegex(ValueError, "identical runtime artifact"):
                lock.validate(directory)

    def test_validator_rejects_changed_environment_markers(self):
        roots = [lock.Requirement(f"pip=={lock.PIP_VERSION}")]
        with tempfile.TemporaryDirectory() as tmp, patch.object(lock, "roots_for", return_value=roots):
            directory = Path(tmp)
            manifest = self.fixture(directory)
            manifest["lanes"]["runtime"]["environment"]["python_version"] = "3.12"
            (directory / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "environment marker"):
                lock.validate(directory)

    def test_kernel_dependent_markers_require_explicit_review(self):
        report = self.report()
        report["install"][0]["metadata"]["requires_dist"] = ['leaf; platform_release == "x"']
        with self.assertRaisesRegex(ValueError, "kernel-specific"):
            lock.normalize_report(report, "pip")

    def test_candidate_dockerfile_has_no_unlocked_install_or_dev_graph(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(lock, "validate"):
            target = Path(tmp) / "Dockerfile"
            lock.candidate_dockerfile(Path(tmp), target)
            content = target.read_text()
            self.assertEqual(content.count("--require-hashes --only-binary=:all:"), 4)
            self.assertEqual(content.count("--force-reinstall"), 4)
            self.assertEqual(content.count("python -m pip check"), 2)
            self.assertNotIn("-r requirements-runtime.txt", content)
            self.assertNotIn("-r requirements-db.txt", content)
            self.assertNotIn("requirements-dev", content)
            self.assertIn("FROM builder-base AS builder-dbtasks", content)

    def test_verifier_forces_all_hash_checks_even_if_packages_exist(self):
        manifest = {"lanes": {lane: {"packages": {}} for lane in lock.INPUTS}}
        inventory = json.dumps([{"name": "pip", "version": lock.PIP_VERSION}])
        with (patch.object(lock, "assert_platform"), patch.object(lock, "validate", return_value=manifest),
              patch.object(lock.subprocess, "run"), patch.object(lock.subprocess, "check_output", return_value=inventory),
              patch.object(lock, "pip_command") as pip, patch("builtins.print")):
            lock.verify(Path("/synthetic-locks"))
        installs = [call.args for call in pip.call_args_list if call.args[1] == "install"]
        self.assertEqual(len(installs), 8)
        for command in installs:
            self.assertIn("--force-reinstall", command)
            self.assertIn("--require-hashes", command)

    def test_activated_dockerfile_cannot_lose_its_lock_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            backend = Path(tmp)
            for reference in [lock.LOCK_RELATIVE, "requirements-runtime.lock"]:
                (backend / "Dockerfile").write_text(f"COPY {reference} /app/\n")
                with patch.object(lock, "BACKEND", backend), self.subTest(reference=reference):
                    with self.assertRaisesRegex(ValueError, "requires committed runtime locks and provenance"):
                        lock.validate_activation(backend / lock.LOCK_RELATIVE)

    def test_initial_generation_is_allowed_without_activated_dockerfile(self):
        with tempfile.TemporaryDirectory() as tmp:
            backend = Path(tmp)
            (backend / "Dockerfile").write_text("COPY requirements-runtime.txt /app/\n")
            with patch.object(lock, "BACKEND", backend), patch.object(lock, "validate") as validate:
                lock.validate_activation(backend / lock.LOCK_RELATIVE)
                validate.assert_not_called()

    def test_activated_lock_directory_requires_provenance_before_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            backend = Path(tmp)
            (backend / "Dockerfile").write_text(f"COPY {lock.LOCK_RELATIVE}/requirements-runtime.lock /app/\n")
            directory = backend / lock.LOCK_RELATIVE
            directory.mkdir(parents=True)
            (directory / "requirements-runtime.lock").write_text("# incomplete fixture\n")
            with patch.object(lock, "BACKEND", backend), self.assertRaises(FileNotFoundError):
                lock.validate_activation(directory)

    def test_activation_guard_is_before_generated_overlay(self):
        workflow = (lock.ROOT / ".github/workflows/python-runtime-lock.yml").read_text()
        self.assertLess(workflow.index("runtime_dependency_lock.py preflight"),
                        workflow.index('cp "$RUNNER_TEMP/runtime-lock/first/"* "$lock_dir/"'))

    def test_workflow_verifies_and_names_the_exact_candidate_source(self):
        workflow = (lock.ROOT / ".github/workflows/python-runtime-lock.yml").read_text()
        source = "${{ github.event.pull_request.head.sha || github.sha }}"
        self.assertIn(f"ref: {source}", workflow)
        self.assertIn(f"EXPECTED_SOURCE_SHA: {source}", workflow)
        self.assertIn('test "$(git rev-parse HEAD)" = "$EXPECTED_SOURCE_SHA"', workflow)
        self.assertIn(f"name: runtime-lock-candidate-{source}", workflow)
        self.assertLess(workflow.index("Verify exact candidate source checkout"),
                        workflow.index("Build the production resolver platform"))

    def test_bootstrap_requires_the_reviewed_pip_hash(self):
        report = self.report()
        report["install"][0]["download_info"]["archive_info"]["hashes"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "reviewed bootstrap hash"):
            lock.normalize_report(report, "pip")

    def test_already_installed_pip_still_checks_artifact_hash(self):
        # Use ensurepip's offline seed in a disposable venv, never the runner's
        # possibly externally managed Python. The synthetic wheel is dry-run
        # only; no network access or global package changes are needed.
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            environment = directory / "venv"
            subprocess.run([sys.executable, "-I", "-m", "venv", str(environment)],
                           check=True, capture_output=True, text=True, timeout=30)
            python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            details = json.loads(subprocess.check_output(
                [str(python), "-I", "-c",
                 "import importlib.metadata, json, sys; "
                 "print(json.dumps([sys.prefix, sys.base_prefix, importlib.metadata.version('pip')]))"],
                text=True, timeout=30))
            self.assertEqual(Path(details[0]).resolve(), environment.resolve())
            self.assertNotEqual(details[0], details[1])
            version = details[2]
            wheel = directory / f"pip-{version}-py3-none-any.whl"
            info = f"pip-{version}.dist-info"
            with zipfile.ZipFile(wheel, "w") as archive:
                archive.writestr(f"{info}/METADATA", f"Metadata-Version: 2.1\nName: pip\nVersion: {version}\n")
                archive.writestr(f"{info}/WHEEL", "Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
                archive.writestr(f"{info}/RECORD", "")
            requirements = directory / "requirements.txt"
            requirements.write_text(f"pip=={version} --hash=sha256:{'0' * 64}\n")
            command = [str(python), "-I", "-m", "pip", "install", "--dry-run", "--no-index", "--no-cache-dir",
                       "--find-links", str(directory), "--require-hashes", "--only-binary=:all:", "-r", str(requirements)]
            env = {key: value for key, value in os.environ.items() if not key.startswith("PIP_")}
            env.update(PIP_CONFIG_FILE=os.devnull, PIP_DISABLE_PIP_VERSION_CHECK="1")
            bypass = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(bypass.returncode, 0, bypass.stderr)
            rejected = subprocess.run([*command, "--force-reinstall"], env=env,
                                      capture_output=True, text=True, timeout=30)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("Expected sha256", rejected.stderr)
            expected = hashlib.sha256(wheel.read_bytes()).hexdigest()
            requirements.write_text(f"pip=={version} --hash=sha256:{expected}\n")
            accepted = subprocess.run([*command, "--force-reinstall"], env=env,
                                      capture_output=True, text=True, timeout=30)
            self.assertEqual(accepted.returncode, 0, accepted.stderr)

    def test_wrong_platform_fails_before_resolution(self):
        with patch.object(lock.platform, "python_version", return_value="3.12.14"), patch.object(lock, "pip_command") as pip:
            with self.assertRaisesRegex(ValueError, "requires native"):
                lock.generate(Path("/unused"))
            pip.assert_not_called()


if __name__ == "__main__":
    unittest.main()

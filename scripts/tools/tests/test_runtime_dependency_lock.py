"""Offline regression checks; these do not substitute for native Alpine CI."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
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
                               "archive_info": {"hashes": {"sha256": "a" * 64}}}}]}

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
            self.assertEqual(content.count("python -m pip check"), 2)
            self.assertNotIn("-r requirements-runtime.txt", content)
            self.assertNotIn("-r requirements-db.txt", content)
            self.assertNotIn("requirements-dev", content)
            self.assertIn("FROM builder-base AS builder-dbtasks", content)

    def test_wrong_platform_fails_before_resolution(self):
        with patch.object(lock.platform, "python_version", return_value="3.12.14"), patch.object(lock, "pip_command") as pip:
            with self.assertRaisesRegex(ValueError, "requires native"):
                lock.generate(Path("/unused"))
            pip.assert_not_called()


if __name__ == "__main__":
    unittest.main()

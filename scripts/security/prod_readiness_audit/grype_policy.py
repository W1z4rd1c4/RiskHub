from __future__ import annotations

import argparse
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path


class GrypePolicyError(ValueError):
    pass


_EVIDENCE_SCOPED_PACKAGE_SELECTORS = {
    "CVE-2026-15308": {
        "type": "binary",
        "location": "/usr/local/bin/python3.13",
    },
}


def _suppression_blocks(text: str) -> list[str]:
    starts = [match.start() for match in re.finditer(r"^  - ", text, re.MULTILINE)]
    return [
        text[start:end]
        for start, end in zip(starts, [*starts[1:], len(text)], strict=True)
    ]


def validate_grype_policy(policy_path: Path, *, today: date | None = None) -> None:
    try:
        text = policy_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise GrypePolicyError(f"invalid Grype policy: {exc}") from exc

    if len(re.findall(r"^ignore:\s*$", text, re.MULTILINE)) != 1:
        raise GrypePolicyError(
            "invalid Grype policy: exactly one top-level ignore list is required"
        )

    suppressions = _suppression_blocks(text)
    if not suppressions:
        raise GrypePolicyError(
            "invalid Grype policy: expected at least one suppression"
        )

    current_date = today or datetime.now(UTC).date()
    for suppression in suppressions:
        vulnerability_values = re.findall(
            r"^  - vulnerability:\s*(\S*)\s*$", suppression, re.MULTILINE
        )
        if len(vulnerability_values) != 1 or not re.fullmatch(
            r"CVE-\d{4}-\d{4,}", vulnerability_values[0]
        ):
            raise GrypePolicyError(
                "invalid Grype suppression: one exact CVE vulnerability is required"
            )

        reasons = re.findall(r'^    reason: "(.+)"\s*$', suppression, re.MULTILINE)
        if len(reasons) != 1:
            raise GrypePolicyError(
                "invalid Grype suppression: exactly one non-empty reason is required"
            )
        reason = reasons[0]
        for marker in (
            "Owner:",
            "Decision:",
            "Scanner evidence:",
            "No-fix proof:",
            "Reachability:",
            "Exit:",
        ):
            if marker not in reason:
                raise GrypePolicyError(
                    f"invalid Grype suppression reason: missing {marker.removesuffix(':')}"
                )

        package_blocks = re.findall(
            r"^    package:\s*\n((?:^      [^\n]*(?:\n|$))*)",
            suppression,
            re.MULTILINE,
        )
        if len(package_blocks) != 1:
            raise GrypePolicyError(
                "invalid Grype suppression: exactly one package selector is required"
            )
        package = package_blocks[0]
        package_names = re.findall(r"^      name:\s*(\S*)\s*$", package, re.MULTILINE)
        if len(package_names) != 1 or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._+-]*", package_names[0]
        ):
            raise GrypePolicyError(
                "invalid Grype suppression: one exact package.name is required"
            )
        package_versions = re.findall(
            r"^      version:\s*(\S*)\s*$", package, re.MULTILINE
        )
        if len(package_versions) != 1 or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._+~:-]*", package_versions[0]
        ):
            raise GrypePolicyError(
                "invalid Grype suppression: one exact package.version is required"
            )

        required_selectors = _EVIDENCE_SCOPED_PACKAGE_SELECTORS.get(
            vulnerability_values[0]
        )
        if required_selectors is not None:
            package_types = re.findall(
                r"^      type:\s*(\S*)\s*$", package, re.MULTILINE
            )
            if package_types != [required_selectors["type"]]:
                raise GrypePolicyError(
                    f"invalid Grype suppression: package.type must be exactly {required_selectors['type']}"
                )

            package_locations = re.findall(
                r"^      location:\s*(\S*)\s*$", package, re.MULTILINE
            )
            if package_locations != [required_selectors["location"]]:
                raise GrypePolicyError(
                    "invalid Grype suppression: package.location must be exactly "
                    f"{required_selectors['location']}"
                )

        expiry_values = re.findall(
            r"^    expires-on: (\S+)\s*$", suppression, re.MULTILINE
        )
        if len(expiry_values) != 1:
            raise GrypePolicyError(
                "invalid Grype suppression: exactly one expires-on field is required"
            )
        value = expiry_values[0]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise GrypePolicyError(
                f"invalid Grype suppression expiry: {value} is not a valid ISO date"
            )
        try:
            expiry = date.fromisoformat(value)
        except ValueError as exc:
            raise GrypePolicyError(
                f"invalid Grype suppression expiry: {value} is not a valid ISO date"
            ) from exc
        if current_date > expiry:
            raise GrypePolicyError(f"Grype suppression expired on {expiry.isoformat()}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate RiskHub Grype suppression expiry policy."
    )
    parser.add_argument("--policy", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        validate_grype_policy(args.policy)
    except GrypePolicyError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

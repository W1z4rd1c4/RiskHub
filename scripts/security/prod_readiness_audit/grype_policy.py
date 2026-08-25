from __future__ import annotations

import argparse
import re
import sys
from datetime import UTC, date, datetime
from pathlib import Path

import yaml


class GrypePolicyError(ValueError):
    pass


class _DuplicateYamlKey(GrypePolicyError):
    def __init__(self, key: object) -> None:
        self.key = key
        super().__init__(f"duplicate YAML key: {key}")


class _UniqueKeySafeLoader(yaml.SafeLoader):
    pass


def _construct_unique_mapping(
    loader: _UniqueKeySafeLoader, node: yaml.MappingNode, *, deep: bool = False
) -> dict[object, object]:
    loader.flatten_mapping(node)
    mapping: dict[object, object] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise GrypePolicyError(
                "invalid Grype policy: YAML mapping keys must be scalar"
            ) from exc
        if duplicate:
            raise _DuplicateYamlKey(key)
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeySafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


_PATTERN_METACHARACTERS = frozenset("*?[](){}|+^$\\")


def _load_policy_document(text: str) -> dict[object, object]:
    try:
        document = yaml.load(text, Loader=_UniqueKeySafeLoader)
    except _DuplicateYamlKey as exc:
        if exc.key == "ignore":
            raise GrypePolicyError(
                "invalid Grype policy: exactly one top-level ignore list is required"
            ) from exc
        raise GrypePolicyError(f"invalid Grype policy: {exc}") from exc
    except yaml.YAMLError as exc:
        raise GrypePolicyError("invalid Grype policy: expected valid YAML") from exc

    if (
        not isinstance(document, dict)
        or "ignore" not in document
        or not isinstance(document["ignore"], list)
    ):
        raise GrypePolicyError(
            "invalid Grype policy: exactly one top-level ignore list is required"
        )
    return document


def _suppression_blocks(text: str) -> list[str]:
    starts = [match.start() for match in re.finditer(r"^  - ", text, re.MULTILINE)]
    if not starts:
        return []
    return [
        text[start:end]
        for start, end in zip(starts, [*starts[1:], len(text)], strict=True)
    ]


def _exact_selector(
    block: str, *, field: str, indentation: int, error_field: str
) -> str:
    values = re.findall(
        rf"^{' ' * indentation}{re.escape(field)}:\s*(\S*)\s*$",
        block,
        re.MULTILINE,
    )
    if len(values) != 1 or not values[0]:
        raise GrypePolicyError(
            f"invalid Grype suppression: one exact {error_field} is required"
        )
    raw_value = values[0]
    try:
        value = yaml.safe_load(raw_value)
    except yaml.YAMLError as exc:
        raise GrypePolicyError(
            f"invalid Grype suppression: one exact {error_field} is required"
        ) from exc
    if (
        not isinstance(value, str)
        or not value
        or any(character in raw_value for character in _PATTERN_METACHARACTERS)
    ):
        raise GrypePolicyError(
            f"invalid Grype suppression: one exact {error_field} is required"
        )
    return value


def validate_grype_policy(policy_path: Path, *, today: date | None = None) -> None:
    try:
        text = policy_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise GrypePolicyError(f"invalid Grype policy: {exc}") from exc

    ignore_collections = re.findall(r"^ignore:\s*(\[\])?\s*$", text, re.MULTILINE)
    if len(ignore_collections) != 1:
        raise GrypePolicyError(
            "invalid Grype policy: exactly one top-level ignore list is required"
        )

    suppressions = _suppression_blocks(text)
    if ignore_collections[0] == "[]":
        if suppressions:
            raise GrypePolicyError(
                "invalid Grype policy: explicit empty ignore list cannot contain suppressions"
            )
        document = _load_policy_document(text)
        if document["ignore"]:
            raise GrypePolicyError(
                "invalid Grype policy: explicit empty ignore list cannot contain suppressions"
            )
        return
    if not suppressions:
        raise GrypePolicyError(
            "invalid Grype policy: expected at least one suppression"
        )

    current_date = today or datetime.now(UTC).date()
    suppression_identities: set[tuple[str, ...]] = set()
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
        package_name = _exact_selector(
            package, field="name", indentation=6, error_field="package.name"
        )
        package_version = _exact_selector(
            package, field="version", indentation=6, error_field="package.version"
        )
        package_type = _exact_selector(
            package, field="type", indentation=6, error_field="package.type"
        )
        package_location = _exact_selector(
            package, field="location", indentation=6, error_field="package.location"
        )
        upstream_name = _exact_selector(
            package,
            field="upstream-name",
            indentation=6,
            error_field="package.upstream-name",
        )
        namespace = _exact_selector(
            suppression, field="namespace", indentation=4, error_field="namespace"
        )
        fix_state = _exact_selector(
            suppression, field="fix-state", indentation=4, error_field="fix-state"
        )
        match_type = _exact_selector(
            suppression, field="match-type", indentation=4, error_field="match-type"
        )

        suppression_identity = (
            vulnerability_values[0],
            namespace,
            fix_state,
            match_type,
            package_name,
            package_version,
            package_type,
            package_location,
            upstream_name,
        )
        if suppression_identity in suppression_identities:
            raise GrypePolicyError("invalid Grype policy: duplicate suppression")
        suppression_identities.add(suppression_identity)

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

    _load_policy_document(text)


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

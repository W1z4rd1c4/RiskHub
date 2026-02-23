#!/usr/bin/env python3
"""Enforce a suppression budget for backend/app lint suppressions."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ALLOWLIST = REPO_ROOT / "scripts" / "quality" / "backend-suppression-allowlist.json"
DEFAULT_SCOPE = REPO_ROOT / "backend" / "app"
SUPPRESSION_PATTERN = re.compile(r"#\s*(?:ruff:\s*noqa|noqa\b|type:\s*ignore|pylint:\s*disable)")


@dataclass(frozen=True)
class SuppressionOccurrence:
    path: str
    line: int
    content: str

    @property
    def key(self) -> tuple[str, int]:
        return (self.path, self.line)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("suppression-budget-%Y%m%d-%H%M%S")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate suppression budget in backend/app.")
    parser.add_argument(
        "--allowlist",
        default=str(DEFAULT_ALLOWLIST),
        help="Path to suppression allowlist JSON.",
    )
    parser.add_argument(
        "--scope",
        default=str(DEFAULT_SCOPE),
        help="Repository-relative or absolute path to scan for suppressions.",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory. Defaults to tests/results/quality/suppression-budget-<timestamp>/.",
    )
    return parser.parse_args()


def resolve_output_dir(output_dir_arg: str, run_id: str) -> Path:
    if output_dir_arg:
        return Path(output_dir_arg).resolve()
    return REPO_ROOT / "tests" / "results" / "quality" / run_id


def parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def collect_suppressions(scope: Path) -> list[SuppressionOccurrence]:
    occurrences: list[SuppressionOccurrence] = []
    for file_path in sorted(scope.rglob("*.py")):
        rel = file_path.relative_to(REPO_ROOT).as_posix()
        try:
            lines = file_path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_no, line in enumerate(lines, start=1):
            if SUPPRESSION_PATTERN.search(line):
                occurrences.append(
                    SuppressionOccurrence(path=rel, line=line_no, content=line.strip()),
                )
    return occurrences


def load_allowlist(allowlist_path: Path) -> dict[str, object]:
    try:
        payload = json.loads(allowlist_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Missing allowlist file: {allowlist_path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON in allowlist file: {allowlist_path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Allowlist payload must be a JSON object")
    return payload


def validate(
    *,
    observed: list[SuppressionOccurrence],
    allowlist_payload: dict[str, object],
) -> dict[str, object]:
    max_total_raw = allowlist_payload.get("max_total")
    if not isinstance(max_total_raw, int):
        raise RuntimeError("Allowlist must include integer `max_total`.")
    max_total = max_total_raw

    entries_raw = allowlist_payload.get("entries")
    if not isinstance(entries_raw, list):
        raise RuntimeError("Allowlist must include list `entries`.")

    allowlist_by_key: dict[tuple[str, int], dict[str, object]] = {}
    for raw_entry in entries_raw:
        if not isinstance(raw_entry, dict):
            raise RuntimeError("Each allowlist entry must be an object.")
        path = raw_entry.get("path")
        line = raw_entry.get("line")
        if not isinstance(path, str) or not isinstance(line, int):
            raise RuntimeError("Allowlist entries require `path` (str) and `line` (int).")
        allowlist_by_key[(path, line)] = raw_entry

    unmatched: list[dict[str, object]] = []
    expired: list[dict[str, object]] = []
    matched_keys: set[tuple[str, int]] = set()
    today = datetime.now(timezone.utc).date()

    for item in observed:
        entry = allowlist_by_key.get(item.key)
        if entry is None:
            unmatched.append(
                {"path": item.path, "line": item.line, "content": item.content},
            )
            continue

        match_text = entry.get("match")
        if isinstance(match_text, str) and match_text not in item.content:
            unmatched.append(
                {
                    "path": item.path,
                    "line": item.line,
                    "content": item.content,
                    "reason": f"allowlist `match` not found: {match_text}",
                },
            )
            continue

        expiry_raw = entry.get("expires_on")
        expiry = parse_date(expiry_raw if isinstance(expiry_raw, str) else None)
        if expiry is not None and expiry < today:
            expired.append(
                {
                    "path": item.path,
                    "line": item.line,
                    "expires_on": expiry.isoformat(),
                    "owner": entry.get("owner"),
                    "reason": entry.get("reason"),
                },
            )
        matched_keys.add(item.key)

    stale_entries: list[dict[str, object]] = []
    for key, entry in allowlist_by_key.items():
        if key not in matched_keys:
            stale_entries.append(entry)

    over_budget = len(observed) > max_total

    status = "pass"
    if unmatched or expired or over_budget:
        status = "fail"

    return {
        "status": status,
        "summary": {
            "observed_total": len(observed),
            "allowlist_total": len(allowlist_by_key),
            "max_total": max_total,
            "over_budget": over_budget,
            "unmatched_count": len(unmatched),
            "expired_count": len(expired),
            "stale_allowlist_entries": len(stale_entries),
        },
        "unmatched": unmatched,
        "expired": expired,
        "stale_allowlist_entries": stale_entries,
    }


def print_summary(payload: dict[str, object]) -> None:
    summary = payload["summary"]
    status = payload["status"]
    print(f"Suppression budget: {status.upper()}")
    print(
        "Observed={observed_total}, Max={max_total}, "
        "Unmatched={unmatched_count}, Expired={expired_count}, StaleAllowlist={stale_allowlist_entries}".format(
            observed_total=summary["observed_total"],
            max_total=summary["max_total"],
            unmatched_count=summary["unmatched_count"],
            expired_count=summary["expired_count"],
            stale_allowlist_entries=summary["stale_allowlist_entries"],
        )
    )

    unmatched = payload.get("unmatched", [])
    if unmatched:
        print("\nUnapproved suppressions:")
        for item in unmatched[:50]:
            print(f"- {item['path']}:{item['line']} :: {item['content']}")

    expired = payload.get("expired", [])
    if expired:
        print("\nExpired suppressions:")
        for item in expired[:50]:
            print(
                f"- {item['path']}:{item['line']} (expired {item['expires_on']}) owner={item.get('owner')}"
            )


def main() -> int:
    args = parse_args()
    scope = Path(args.scope)
    if not scope.is_absolute():
        scope = (REPO_ROOT / scope).resolve()
    allowlist_path = Path(args.allowlist)
    if not allowlist_path.is_absolute():
        allowlist_path = (REPO_ROOT / allowlist_path).resolve()

    run_id = run_id_now()
    output_dir = resolve_output_dir(args.output_dir, run_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    observed = collect_suppressions(scope)
    allowlist_payload = load_allowlist(allowlist_path)
    validation = validate(observed=observed, allowlist_payload=allowlist_payload)

    payload: dict[str, object] = {
        "run_id": run_id,
        "generated_at_utc": utc_now_iso(),
        "repo_root": str(REPO_ROOT),
        "scope": str(scope),
        "allowlist": str(allowlist_path),
        "status": validation["status"],
        "summary": validation["summary"],
        "observed": [item.__dict__ for item in observed],
        "unmatched": validation["unmatched"],
        "expired": validation["expired"],
        "stale_allowlist_entries": validation["stale_allowlist_entries"],
    }

    output_file = output_dir / "suppression-budget.json"
    output_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print_summary(payload)
    print(f"Artifact: {output_file.relative_to(REPO_ROOT)}")
    return 0 if payload["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Validate documentation contract for in-app admin/user manuals."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = REPO_ROOT / "docs"

ADMIN_EN_DIR = DOCS_ROOT / "admin"
ADMIN_CS_DIR = DOCS_ROOT / "admin-cs"
USER_EN_DIR = DOCS_ROOT / "user"
USER_CS_DIR = DOCS_ROOT / "user-cs"

DOC_DIRS = [ADMIN_EN_DIR, ADMIN_CS_DIR, USER_EN_DIR, USER_CS_DIR]
REQUIRED_FRONTMATTER_KEYS = {
    "title",
    "version",
    "last_updated",
    "audience",
    "source_of_truth",
    "summary",
    "tags",
}

EN_ADMIN_LEAKAGE = [
    r"\bCRO\b",
    r"Risk Manager",
    r"Department Head",
    r"\bEmployee\b",
    r"\bCompliance\b",
    r"\bLegal\b",
    r"Internal Audit",
    r"\bActuarial\b",
    r"\bCEO\b",
    r"\bCFO\b",
]

CS_ADMIN_LEAKAGE = [
    r"Risk manažer",
    r"Vedoucí oddělení",
    r"\bZaměstnanec\b",
    r"Interní audit",
    r"\bCEO\b",
    r"\bCFO\b",
]

LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
H2_PATTERN = re.compile(r"^##\s+", re.MULTILINE)
WORD_PATTERN = re.compile(r"\b[\w-]+\b")


class FrontmatterParseError(Exception):
    pass


def list_markdown_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.glob("*.md") if path.is_file())


def parse_frontmatter(path: Path) -> tuple[dict[str, str | list[str]], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise FrontmatterParseError("missing opening frontmatter delimiter")

    lines = text.splitlines()
    end_idx: int | None = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            end_idx = idx
            break

    if end_idx is None:
        raise FrontmatterParseError("missing closing frontmatter delimiter")

    metadata_lines = lines[1:end_idx]
    body = "\n".join(lines[end_idx + 1 :]).strip()

    metadata: dict[str, str | list[str]] = {}
    i = 0
    while i < len(metadata_lines):
        line = metadata_lines[i].rstrip()
        if not line or line.strip().startswith("#"):
            i += 1
            continue

        if ":" not in line:
            raise FrontmatterParseError(f"invalid frontmatter line: `{line}`")

        key, raw_value = line.split(":", 1)
        key = key.strip().lower()
        value = raw_value.strip()

        if value:
            metadata[key] = strip_quotes(value)
            i += 1
            continue

        items: list[str] = []
        i += 1
        while i < len(metadata_lines):
            item_line = metadata_lines[i]
            match = re.match(r"^\s*-\s+(.+)$", item_line)
            if not match:
                break
            items.append(strip_quotes(match.group(1).strip()))
            i += 1
        metadata[key] = items

    return metadata, body


def strip_quotes(value: str) -> str:
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1].strip()
    return value


def check_frontmatter(path: Path, metadata: dict[str, str | list[str]], errors: list[str]) -> None:
    missing = sorted(REQUIRED_FRONTMATTER_KEYS - set(metadata.keys()))
    if missing:
        errors.append(f"{path}: missing frontmatter keys: {', '.join(missing)}")

    audience = metadata.get("audience")
    if not isinstance(audience, str) or audience not in {"admin", "user"}:
        errors.append(f"{path}: audience must be `admin` or `user`")

    tags = metadata.get("tags")
    if not isinstance(tags, list) or not tags:
        errors.append(f"{path}: tags must be a non-empty list")


def check_richness(path: Path, body: str, errors: list[str]) -> None:
    word_count = len(WORD_PATTERN.findall(body))
    h2_count = len(H2_PATTERN.findall(body))

    minimum_words = 260 if path.name.lower() == "readme.md" else 180
    if word_count < minimum_words:
        errors.append(f"{path}: content too short ({word_count} words, expected >= {minimum_words})")

    if h2_count < 4:
        errors.append(f"{path}: expected at least 4 second-level sections (`##` headings), found {h2_count}")


def is_external_link(target: str) -> bool:
    return (
        target.startswith("http://")
        or target.startswith("https://")
        or target.startswith("mailto:")
        or target.startswith("#")
    )


def check_links(path: Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for raw_target in LINK_PATTERN.findall(text):
        target = raw_target.strip()
        if is_external_link(target):
            continue

        clean_target = target.split("#", 1)[0].strip()
        if not clean_target:
            continue

        # App route links are expected (e.g., /risks, /settings)
        if clean_target.startswith("/") and not clean_target.lower().endswith(".md"):
            continue

        target_path = (path.parent / clean_target).resolve()
        if not target_path.exists():
            errors.append(f"{path}: broken relative link `{target}`")


def check_parity(left_dir: Path, right_dir: Path, errors: list[str]) -> None:
    left_files = {path.name for path in list_markdown_files(left_dir)}
    right_files = {path.name for path in list_markdown_files(right_dir)}

    only_left = sorted(left_files - right_files)
    only_right = sorted(right_files - left_files)

    if only_left:
        errors.append(f"Parity mismatch {left_dir} -> missing in {right_dir}: {', '.join(only_left)}")
    if only_right:
        errors.append(f"Parity mismatch {right_dir} -> missing in {left_dir}: {', '.join(only_right)}")


def check_admin_leakage(directory: Path, patterns: list[str], errors: list[str]) -> None:
    for path in list_markdown_files(directory):
        text = path.read_text(encoding="utf-8")
        for pattern in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                errors.append(f"{path}: admin audience leakage keyword detected (`{pattern}`)")


def main() -> int:
    errors: list[str] = []

    all_docs: list[Path] = []
    for doc_dir in DOC_DIRS:
        if not doc_dir.exists():
            errors.append(f"Missing documentation directory: {doc_dir}")
            continue
        all_docs.extend(list_markdown_files(doc_dir))

    for path in all_docs:
        try:
            metadata, body = parse_frontmatter(path)
        except FrontmatterParseError as exc:
            errors.append(f"{path}: {exc}")
            continue

        check_frontmatter(path, metadata, errors)
        check_richness(path, body, errors)
        check_links(path, errors)

    check_parity(ADMIN_EN_DIR, ADMIN_CS_DIR, errors)
    check_parity(USER_EN_DIR, USER_CS_DIR, errors)

    check_admin_leakage(ADMIN_EN_DIR, EN_ADMIN_LEAKAGE, errors)
    check_admin_leakage(ADMIN_CS_DIR, CS_ADMIN_LEAKAGE, errors)

    if errors:
        print("Docs contract check failed:")
        for idx, error in enumerate(errors, start=1):
            print(f"{idx}. {error}")
        return 1

    print("Docs contract check passed.")
    print(f"Validated {len(all_docs)} in-app documentation files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

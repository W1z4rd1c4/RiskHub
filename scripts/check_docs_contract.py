#!/usr/bin/env python3
"""
Validate in-app documentation contract for RiskHub manuals.

This checker enforces:
- EN/CS filename parity for user/admin libraries
- required frontmatter keys + tag taxonomy
- minimum richness (word count + required H2 sections; user docs use manual-style sections)
- link contract:
  - doc-to-doc links must be `./file.md` (same directory) and stay inside the reader
  - app route links must be `/path`
  - anchor links `#heading-id` are allowed
  - external links `https://...` are allowed
- admin docs must not contain direct instructions targeting non-admin roles
"""

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

DOC_DIRS: list[Path] = [ADMIN_EN_DIR, ADMIN_CS_DIR, USER_EN_DIR, USER_CS_DIR]

REQUIRED_FRONTMATTER_KEYS = {
    "title",
    "version",
    "last_updated",
    "audience",
    "source_of_truth",
    "summary",
    "tags",
}

ALLOWED_TAGS = {
    # Global tags
    "overview",
    "onboarding",
    "workflow",
    "approvals",
    "notifications",
    "exports",
    "audit",
    "troubleshooting",
    "settings",
    # Module tags
    "risks",
    "controls",
    "kri",
    "issues",
    "vendors",
    "departments",
    "governance",
    "access",
    "riskhub",
    "activity-log",
}

README_MIN_WORDS = 900
PAGE_MIN_WORDS = 800
README_MIN_H2 = 10
PAGE_MIN_H2 = 8

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
H2_TITLE_PATTERN = re.compile(r"^##\s+(.+)$", re.MULTILINE)
WORD_PATTERN = re.compile(r"\b[\w-]+\b")

# Required section titles (H2) for module/runbook pages.
USER_EN_REQUIRED_H2 = [
    "What This Page Helps You Do",
    "Before You Start",
    "Where To Find It",
    "What You Can See and Change",
    "How To Complete Common Tasks",
    "Approvals and Notifications",
    "Finding, Filtering, and Evidence",
    "Tips and Common Mistakes",
    "Troubleshooting",
    "Related Manuals",
]

USER_CS_REQUIRED_H2 = [
    "S čím vám tato stránka pomůže",
    "Než začnete",
    "Kde to najdete",
    "Co můžete vidět a měnit",
    "Jak dokončit běžné úkoly",
    "Schvalování a notifikace",
    "Vyhledávání, filtrování a evidence",
    "Tipy a časté chyby",
    "Troubleshooting",
    "Související manuály",
]

ADMIN_EN_REQUIRED_H2 = [
    "Overview",
    "When To Use This",
    "Preconditions and Safety",
    "Step-by-Step Procedure",
    "Verification Checklist",
    "Rollback Strategy",
    "Troubleshooting",
    "Escalation and Handoff",
    "Related Documentation",
]

ADMIN_CS_REQUIRED_H2 = [
    "Přehled",
    "Kdy to použít",
    "Předpoklady a bezpečnost",
    "Postup krok za krokem",
    "Ověření po změně",
    "Rollback",
    "Troubleshooting",
    "Eskalace a předání",
    "Související dokumentace",
]

# Required section titles (H2) for README/index pages.
USER_README_EN_REQUIRED_H2 = [
    "Who This Manual Is For",
    "Start Here",
    "Manuals by Area",
    "Manuals by Task",
    "How Your Role Affects What You See",
    "How To Use This Reader",
    "How To Search and Filter Manuals",
    "How To Ask For Help",
    "What Changed Recently",
    "Related Manuals",
]

USER_README_CS_REQUIRED_H2 = [
    "Pro koho je tento manuál",
    "Začněte tady",
    "Manuály podle oblasti",
    "Manuály podle úkolu",
    "Jak vaše role ovlivňuje zobrazení",
    "Jak používat čtečku manuálů",
    "Jak vyhledávat a filtrovat manuály",
    "Jak požádat o pomoc",
    "Co se nedávno změnilo",
    "Související manuály",
]

ADMIN_README_EN_REQUIRED_H2 = [
    "Overview",
    "Audience and Boundary",
    "Quick Start (First Hour)",
    "Library Map (By Operator Task)",
    "Access and Safety Principles",
    "Operational Support Triage",
    "Observability and Evidence",
    "Change Management Expectations",
    "Escalation and Handoff",
    "Related Documentation",
]

ADMIN_README_CS_REQUIRED_H2 = [
    "Přehled",
    "Cílová skupina a hranice",
    "Rychlý start (první hodina)",
    "Mapa knihovny (podle úkolu operátora)",
    "Principy přístupů a bezpečnosti",
    "Triage provozní podpory",
    "Observabilita a evidence",
    "Očekávání pro change management",
    "Eskalace a předání",
    "Související dokumentace",
]

# Admin leakage: allow role mentions for handoff context, but forbid direct instructions aimed at non-admin roles.
ADMIN_FORBIDDEN_INSTRUCTION_PATTERNS_EN = [
    r"\bif you are (?:a|an)?\s*(?:cro|risk manager|department head|employee|viewer|compliance|legal|internal audit|actuarial)\b",
    r"\bfor (?:cro|risk managers?|department heads?|employees?|viewers?|compliance|legal|internal audit|actuarial)\b",
    r"\bas (?:a|an)?\s*(?:cro|risk manager|department head|employee|viewer|compliance|legal|internal audit|actuarial)\b",
]

ADMIN_FORBIDDEN_INSTRUCTION_PATTERNS_CS = [
    r"\bpokud jste\s+(?:cro|zam[eě]stnanec|vedouc[ií] odd[eě]len[ií]|risk mana[žz]er|compliance|legal|intern[ií] audit|aktu[aá]r|viewer)\b",
    r"\bpro\s+(?:cro|zam[eě]stnance|vedouc[ií] odd[eě]len[ií]|risk mana[žz]era|compliance|legal|intern[ií] audit|aktu[aá]ry|viewery?)\b",
    r"\bjako\s+(?:cro|zam[eě]stnanec|vedouc[ií] odd[eě]len[ií]|risk mana[žz]er|compliance|legal|intern[ií] audit|aktu[aá]r|viewer)\b",
]


class FrontmatterParseError(Exception):
    pass


def list_markdown_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.glob("*.md") if path.is_file())


def strip_quotes(value: str) -> str:
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1].strip()
    return value


def parse_frontmatter(path: Path) -> tuple[dict[str, str | list[str]], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise FrontmatterParseError("missing opening frontmatter delimiter (`---`)")

    lines = text.splitlines()
    end_idx: int | None = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            end_idx = idx
            break

    if end_idx is None:
        raise FrontmatterParseError("missing closing frontmatter delimiter (`---`)")

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


def extract_h2_titles(body: str) -> list[str]:
    return [match.group(1).strip() for match in H2_TITLE_PATTERN.finditer(body)]


def contains_required_in_order(h2_titles: list[str], required: list[str]) -> bool:
    pos = 0
    for title in required:
        try:
            idx = h2_titles.index(title, pos)
        except ValueError:
            return False
        pos = idx + 1
    return True


def detect_library(path: Path) -> tuple[str, str]:
    """
    Return (audience, language) based on directory:
      - docs/user -> ("user", "en")
      - docs/user-cs -> ("user", "cs")
      - docs/admin -> ("admin", "en")
      - docs/admin-cs -> ("admin", "cs")
    """
    parent = path.parent.name
    if parent == "user":
        return "user", "en"
    if parent == "user-cs":
        return "user", "cs"
    if parent == "admin":
        return "admin", "en"
    if parent == "admin-cs":
        return "admin", "cs"
    return "unknown", "unknown"


def expected_required_h2(path: Path, audience: str, language: str) -> list[str]:
    is_readme = path.name.lower() == "readme.md"
    if audience == "user" and language == "en":
        return USER_README_EN_REQUIRED_H2 if is_readme else USER_EN_REQUIRED_H2
    if audience == "user" and language == "cs":
        return USER_README_CS_REQUIRED_H2 if is_readme else USER_CS_REQUIRED_H2
    if audience == "admin" and language == "en":
        return ADMIN_README_EN_REQUIRED_H2 if is_readme else ADMIN_EN_REQUIRED_H2
    if audience == "admin" and language == "cs":
        return ADMIN_README_CS_REQUIRED_H2 if is_readme else ADMIN_CS_REQUIRED_H2
    return []


def check_frontmatter(path: Path, audience: str, metadata: dict[str, str | list[str]], errors: list[str]) -> None:
    missing = sorted(REQUIRED_FRONTMATTER_KEYS - set(metadata.keys()))
    if missing:
        errors.append(f"{path}: missing frontmatter keys: {', '.join(missing)}")

    # audience must match directory
    raw_audience = metadata.get("audience")
    if not isinstance(raw_audience, str) or raw_audience not in {"admin", "user"}:
        errors.append(f"{path}: frontmatter `audience` must be `admin` or `user`")
    elif raw_audience != audience:
        errors.append(f"{path}: frontmatter `audience` is `{raw_audience}` but directory expects `{audience}`")

    last_updated = metadata.get("last_updated")
    if not isinstance(last_updated, str) or not DATE_PATTERN.match(last_updated.strip()):
        errors.append(f"{path}: frontmatter `last_updated` must be YYYY-MM-DD")

    # Require non-empty strings for these keys.
    for key in ["title", "version", "source_of_truth", "summary"]:
        value = metadata.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{path}: frontmatter `{key}` must be a non-empty string")

    tags = metadata.get("tags")
    if not isinstance(tags, list) or not tags:
        errors.append(f"{path}: frontmatter `tags` must be a non-empty list")
        return

    normalized: list[str] = []
    for tag in tags:
        if not isinstance(tag, str) or not tag.strip():
            errors.append(f"{path}: tags must be non-empty strings")
            continue
        normalized.append(tag.strip())

    if not (5 <= len(normalized) <= 10):
        errors.append(f"{path}: tags must contain 5-10 items (found {len(normalized)})")

    unknown_tags = sorted({tag for tag in normalized if tag not in ALLOWED_TAGS})
    if unknown_tags:
        errors.append(f"{path}: unknown tags: {', '.join(unknown_tags)}")


def check_richness(path: Path, body: str, errors: list[str]) -> None:
    word_count = len(WORD_PATTERN.findall(body))
    h2_count = len(extract_h2_titles(body))

    is_readme = path.name.lower() == "readme.md"
    min_words = README_MIN_WORDS if is_readme else PAGE_MIN_WORDS
    min_h2 = README_MIN_H2 if is_readme else PAGE_MIN_H2

    if word_count < min_words:
        errors.append(f"{path}: content too short ({word_count} words, expected >= {min_words})")
    if h2_count < min_h2:
        errors.append(f"{path}: expected at least {min_h2} second-level sections (`##`), found {h2_count}")


def is_external_link(target: str) -> bool:
    return target.startswith("http://") or target.startswith("https://") or target.startswith("mailto:")


def check_links(path: Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    for raw_target in LINK_PATTERN.findall(text):
        target = raw_target.strip()

        if not target:
            continue

        # Allowed: in-doc anchor
        if target.startswith("#"):
            continue

        # Allowed: external
        if is_external_link(target):
            continue

        # Allowed: app routes (e.g. /risks, /settings)
        if target.startswith("/"):
            if target.split("#", 1)[0].lower().endswith(".md"):
                errors.append(f"{path}: app route link must not point to markdown file `{target}`")
            continue

        # Doc-to-doc links must stay inside the library: `./file.md`
        clean_target = target.split("#", 1)[0].strip()
        if not clean_target:
            continue

        if not clean_target.startswith("./"):
            errors.append(f"{path}: doc link must use `./file.md` format, got `{target}`")
            continue

        # Disallow nested paths or parent traversal.
        remainder = clean_target[2:]
        if ".." in remainder or "/" in remainder or "\\" in remainder:
            errors.append(f"{path}: doc link must stay in same directory, got `{target}`")
            continue

        if not remainder.lower().endswith(".md"):
            errors.append(f"{path}: doc link must target a markdown file, got `{target}`")
            continue

        target_path = (path.parent / remainder).resolve()
        if not target_path.exists():
            errors.append(f"{path}: broken doc link `{target}` (missing {target_path})")


def check_required_sections(path: Path, audience: str, language: str, body: str, errors: list[str]) -> None:
    required = expected_required_h2(path, audience, language)
    if not required:
        return

    h2_titles = extract_h2_titles(body)
    missing = [title for title in required if title not in h2_titles]
    if missing:
        errors.append(f"{path}: missing required sections: {', '.join(missing)}")
        return

    if not contains_required_in_order(h2_titles, required):
        errors.append(f"{path}: required sections must appear in the standard order")


def check_parity(left_dir: Path, right_dir: Path, errors: list[str]) -> None:
    left_files = {path.name for path in list_markdown_files(left_dir)}
    right_files = {path.name for path in list_markdown_files(right_dir)}

    only_left = sorted(left_files - right_files)
    only_right = sorted(right_files - left_files)

    if only_left:
        errors.append(f"Parity mismatch {left_dir} -> missing in {right_dir}: {', '.join(only_left)}")
    if only_right:
        errors.append(f"Parity mismatch {right_dir} -> missing in {left_dir}: {', '.join(only_right)}")


def check_admin_instruction_leakage(path: Path, language: str, body: str, errors: list[str]) -> None:
    patterns = (
        ADMIN_FORBIDDEN_INSTRUCTION_PATTERNS_EN
        if language == "en"
        else ADMIN_FORBIDDEN_INSTRUCTION_PATTERNS_CS
    )
    for pattern in patterns:
        if re.search(pattern, body, flags=re.IGNORECASE):
            errors.append(f"{path}: admin doc contains non-admin-targeted instruction pattern (`{pattern}`)")


def main() -> int:
    errors: list[str] = []

    for doc_dir in DOC_DIRS:
        if not doc_dir.exists():
            errors.append(f"Missing documentation directory: {doc_dir}")

    # Parity checks first (fast feedback).
    if ADMIN_EN_DIR.exists() and ADMIN_CS_DIR.exists():
        check_parity(ADMIN_EN_DIR, ADMIN_CS_DIR, errors)
    if USER_EN_DIR.exists() and USER_CS_DIR.exists():
        check_parity(USER_EN_DIR, USER_CS_DIR, errors)

    all_docs: list[Path] = []
    for doc_dir in DOC_DIRS:
        if doc_dir.exists():
            all_docs.extend(list_markdown_files(doc_dir))

    for path in all_docs:
        audience, language = detect_library(path)
        try:
            metadata, body = parse_frontmatter(path)
        except FrontmatterParseError as exc:
            errors.append(f"{path}: {exc}")
            continue

        check_frontmatter(path, audience, metadata, errors)
        check_richness(path, body, errors)
        check_required_sections(path, audience, language, body, errors)
        check_links(path, errors)

        if audience == "admin":
            check_admin_instruction_leakage(path, language, body, errors)

    if errors:
        print("\n".join(errors))
        print(f"\nDocumentation contract FAILED ({len(errors)} errors)")
        return 1

    print("Documentation contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

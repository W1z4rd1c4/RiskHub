from __future__ import annotations

import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models import User
from app.models.role import RoleType
from app.schemas.admin import DocumentationEntry, DocumentationResponse

router = APIRouter()

_DOC_TAGS_BY_STEM: dict[str, list[str]] = {
    "getting-started": ["onboarding", "basics"],
    "approvals": ["workflow", "approvals"],
    "departments": ["departments", "organization"],
    "reports": ["reports", "exports"],
    "riskhub-config": ["configuration", "risk-hub"],
    "user-management": ["users", "access"],
    "controls": ["controls", "execution"],
    "dashboard": ["dashboard", "reporting"],
    "faq": ["faq", "support"],
    "kris": ["kri", "metrics"],
    "notifications": ["notifications", "workflow"],
    "risks": ["risks", "assessment"],
    "vendors": ["vendors", "third-party"],
    "readme": ["overview"],
}

_DOCS_BASE_ENV = "RISKHUB_DOCS_BASE_DIR"


def _extract_title(content: str, filename: str) -> str:
    """Extract title from first H1 heading or generate from filename."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return filename.replace("-", " ").replace("_", " ").replace(".md", "").title()


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1].strip()
    return value


def _parse_frontmatter(content: str) -> tuple[dict[str, str | list[str]], str]:
    """
    Parse a minimal YAML-like frontmatter block.

    Supported shapes:
      ---
      key: value
      list_key:
        - item
      ---
      markdown body...
    """
    if not content.startswith("---\n"):
        return {}, content

    lines = content.splitlines()
    end_index = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            end_index = idx
            break

    if end_index is None:
        return {}, content

    metadata: dict[str, str | list[str]] = {}
    fm_lines = lines[1:end_index]
    i = 0
    while i < len(fm_lines):
        line = fm_lines[i].rstrip()
        if not line or line.strip().startswith("#"):
            i += 1
            continue

        if ":" not in line:
            i += 1
            continue

        key, raw_value = line.split(":", 1)
        key = key.strip().lower()
        value = raw_value.strip()

        if value:
            metadata[key] = _strip_quotes(value)
            i += 1
            continue

        # Parse list values
        items: list[str] = []
        i += 1
        while i < len(fm_lines):
            item_line = fm_lines[i]
            item_match = re.match(r"^\s*-\s+(.+)$", item_line)
            if not item_match:
                break
            items.append(_strip_quotes(item_match.group(1).strip()))
            i += 1
        metadata[key] = items

    body = "\n".join(lines[end_index + 1 :]).lstrip("\n")
    return metadata, body


def _normalize_tags(stem: str, audience: str) -> list[str]:
    """Return deterministic tags for document quick filters."""
    mapped = _DOC_TAGS_BY_STEM.get(stem)
    if mapped:
        return mapped

    parts = [segment for segment in re.split(r"[-_]+", stem) if segment and segment != "readme"]
    if not parts:
        parts = [audience]
    return parts[:4]


def _extract_tags_from_metadata(
    metadata: dict[str, str | list[str]],
    stem: str,
    audience: str,
) -> list[str]:
    raw_tags = metadata.get("tags")
    if isinstance(raw_tags, list):
        normalized = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
        if normalized:
            return normalized
    if isinstance(raw_tags, str) and raw_tags.strip():
        parts = [part.strip() for part in raw_tags.split(",") if part.strip()]
        if parts:
            return parts
    return _normalize_tags(stem, audience)


def _extract_summary(content: str, metadata: dict[str, str | list[str]]) -> str | None:
    raw_summary = metadata.get("summary")
    if isinstance(raw_summary, str) and raw_summary.strip():
        return raw_summary.strip()

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith(">"):
            continue
        if stripped.startswith("-") or stripped.startswith("*"):
            continue
        return stripped
    return None


def _metadata_value(metadata: dict[str, str | list[str]], key: str) -> str | None:
    value = metadata.get(key)
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _resolve_docs_base() -> Path:
    """Return docs base path, with optional env override for tests."""
    override = os.getenv(_DOCS_BASE_ENV)
    if override:
        return Path(override).resolve()

    # Path: docs.py -> admin -> endpoints -> v1 -> api -> app -> backend -> project_root -> docs
    return Path(__file__).resolve().parents[6] / "docs"


@router.get("/docs", response_model=DocumentationResponse)
async def get_documentation(
    current_user: User = Depends(get_current_user),
    locale: str = "en",
) -> DocumentationResponse:
    """
    Get platform documentation based on user role and locale.

    Args:
        locale: Language code ('en' or 'cs'). Defaults to 'en'.
    """
    docs_base = _resolve_docs_base()

    role = current_user.role.name if current_user.role else ""
    audience = "admin" if role == RoleType.ADMIN else "user"

    # Select one audience directory only (strict split by role)
    english_dir = docs_base / audience

    # Determine locale-specific directory for selected audience
    locale_suffix = "-cs" if locale == "cs" else ""
    locale_dir = docs_base / f"{audience}{locale_suffix}"
    if not locale_dir.exists():
        locale_dir = english_dir

    if not english_dir.exists():
        return DocumentationResponse(documents=[])

    documents: list[DocumentationEntry] = []
    for english_doc in sorted(english_dir.glob("*.md"), key=lambda path: path.name.lower()):
        # File-level locale fallback: if localized counterpart is missing,
        # load the English file for this specific document.
        localized_doc = locale_dir / english_doc.name
        doc_path = localized_doc if localized_doc.exists() else english_doc

        with open(doc_path, "r", encoding="utf-8") as file_handle:
            raw_content = file_handle.read()

        metadata, body_content = _parse_frontmatter(raw_content)
        display_content = body_content.strip() or raw_content.strip()

        stem = english_doc.stem.lower()
        title = _metadata_value(metadata, "title") or _extract_title(display_content, doc_path.name)
        documents.append(
            DocumentationEntry(
                id=f"{audience}_{stem}",
                slug=stem,
                title=title,
                summary=_extract_summary(display_content, metadata),
                version=_metadata_value(metadata, "version"),
                last_updated=_metadata_value(metadata, "last_updated"),
                source_of_truth=_metadata_value(metadata, "source_of_truth"),
                content=display_content,
                audience=audience,
                tags=_extract_tags_from_metadata(metadata, stem, audience),
            )
        )

    # Keep onboarding first, then sort the rest by title.
    documents.sort(
        key=lambda entry: (
            0 if entry.id.endswith("_getting-started") else 1,
            entry.title.lower(),
        )
    )

    return DocumentationResponse(documents=documents)

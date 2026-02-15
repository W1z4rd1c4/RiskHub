from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models import User
from app.models.role import RoleType
from app.schemas.admin import DocumentationEntry, DocumentationResponse

router = APIRouter()


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
    import re
    from pathlib import Path

    # Documentation files are in docs/ subdirectories at project root
    # Path: admin.py -> endpoints -> v1 -> api -> app -> backend -> project_root -> docs
    docs_base = Path(__file__).parent.parent.parent.parent.parent.parent / "docs"

    # Determine which directories to read from based on locale
    locale_suffix = "-cs" if locale == "cs" else ""
    admin_dir = docs_base / f"admin{locale_suffix}"
    user_dir = docs_base / f"user{locale_suffix}"

    # Fallback to English if locale-specific dir doesn't exist
    if not admin_dir.exists():
        admin_dir = docs_base / "admin"
    if not user_dir.exists():
        user_dir = docs_base / "user"

    def extract_title(content: str, filename: str) -> str:
        """Extract title from first H1 heading or generate from filename."""
        # Look for first # heading
        match = re.search(r"^#\\s+(.+)$", content, re.MULTILINE)
        if match:
            return match.group(1).strip()
        # Fallback to filename
        return filename.replace("-", " ").replace("_", " ").replace(".md", "").title()

    documents = []
    role = current_user.role.name if current_user.role else ""

    # Define visibility based on role
    can_see_admin = role in {RoleType.ADMIN, RoleType.CRO}

    # Admin docs (CRO and Admin only)
    if can_see_admin and admin_dir.exists():
        for doc_file in admin_dir.glob("*.md"):
            with open(doc_file, "r", encoding="utf-8") as f:
                content = f.read()

            documents.append(
                DocumentationEntry(
                    id=f"admin_{doc_file.stem.lower()}",
                    title=extract_title(content, doc_file.name),
                    content=content,
                )
            )

    # User docs (everyone can see)
    if user_dir.exists():
        for doc_file in user_dir.glob("*.md"):
            with open(doc_file, "r", encoding="utf-8") as f:
                content = f.read()

            documents.append(
                DocumentationEntry(
                    id=f"user_{doc_file.stem.lower()}",
                    title=extract_title(content, doc_file.name),
                    content=content,
                )
            )

    # Sort documents by title for consistent UI
    documents.sort(key=lambda x: x.title)

    return DocumentationResponse(documents=documents)


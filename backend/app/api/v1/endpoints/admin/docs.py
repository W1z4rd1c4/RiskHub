from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models import User
from app.schemas.admin import DocumentationResponse
from app.services._documentation_service import get_documentation_response

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
    return get_documentation_response(current_user=current_user, locale=locale)

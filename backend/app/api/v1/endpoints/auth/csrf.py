from fastapi import APIRouter, Depends, Response, status

from app.core.config import Settings, get_settings
from app.core.tokens import set_csrf_cookie

router = APIRouter()


@router.get("/csrf", status_code=status.HTTP_204_NO_CONTENT)
async def issue_csrf_cookie(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> Response:
    set_csrf_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

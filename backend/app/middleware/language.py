"""
Language Detection Middleware

Detects the user's preferred language from:
1. Accept-Language HTTP header
2. User preference stored in database (if authenticated)
3. Default to English

Adds the detected locale to request.state.locale for use in endpoints.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from typing import Callable

from app.i18n import get_locale_from_header, DEFAULT_LOCALE


class LanguageMiddleware(BaseHTTPMiddleware):
    """
    Middleware to detect and set the request language.
    
    The detected locale is stored in request.state.locale and can be
    accessed by endpoints to return translated responses.
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Get Accept-Language header
        accept_language = request.headers.get('Accept-Language', '')
        
        # Detect locale from header
        locale = get_locale_from_header(accept_language)
        
        # TODO: Check user preference if authenticated
        # This would require access to the current user, which may not be
        # available at middleware level. Could be implemented as:
        #   if hasattr(request.state, 'user') and request.state.user:
        #       user_locale = request.state.user.preferred_language
        #       if user_locale:
        #           locale = user_locale
        
        # Store locale in request state for endpoint access
        request.state.locale = locale
        
        # Process request and add Content-Language header to response
        response = await call_next(request)
        response.headers['Content-Language'] = locale
        
        return response


def get_request_locale(request: Request) -> str:
    """
    Get the locale from the request state.
    
    Args:
        request: The Starlette/FastAPI request object
        
    Returns:
        The detected locale code (e.g., 'en', 'cs')
    """
    return getattr(request.state, 'locale', DEFAULT_LOCALE)

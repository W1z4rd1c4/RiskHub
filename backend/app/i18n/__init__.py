"""
Backend Internationalization (i18n) Module

This module provides translation support for API responses, error messages,
validation messages, and activity log descriptions.

Usage:
    from app.i18n import get_translator, t

    # Get translator for specific locale
    translator = get_translator('cs')
    message = translator('errors.not_found')

    # Or use request-context translation (in endpoints)
    from app.i18n import get_message
    message = get_message(request, 'errors.not_found')
"""

from functools import lru_cache
from typing import Any, Dict, Optional

from .cs import MESSAGES as CS_MESSAGES

# Import message dictionaries
from .en import MESSAGES as EN_MESSAGES

# Supported locales
SUPPORTED_LOCALES = {"en", "cs"}
DEFAULT_LOCALE = "en"

# Message registry
_MESSAGE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "en": EN_MESSAGES,
    "cs": CS_MESSAGES,
}


def get_nested_value(d: dict, key: str, default: str = "") -> str:
    """Get nested dictionary value using dot notation (e.g., 'errors.not_found')."""
    keys = key.split(".")
    value = d
    for k in keys:
        if isinstance(value, dict):
            value = value.get(k)
        else:
            return default
    return value if isinstance(value, str) else default


@lru_cache(maxsize=2)
def get_translator(locale: str = DEFAULT_LOCALE):
    """
    Get a translator function for the specified locale.

    Args:
        locale: Language code ('en', 'cs')

    Returns:
        Callable that takes a message key and returns translated string
    """
    if locale not in SUPPORTED_LOCALES:
        locale = DEFAULT_LOCALE

    messages = _MESSAGE_REGISTRY.get(locale, EN_MESSAGES)
    fallback = EN_MESSAGES if locale != "en" else {}

    def translate(key: str, **kwargs) -> str:
        """
        Translate a message key with optional interpolation.

        Args:
            key: Message key using dot notation (e.g., 'errors.not_found')
            **kwargs: Values for string interpolation

        Returns:
            Translated string with interpolated values
        """
        message = get_nested_value(messages, key)
        if not message and fallback:
            message = get_nested_value(fallback, key)
        if not message:
            return key  # Return key as fallback

        # Apply string interpolation
        if kwargs:
            try:
                message = message.format(**kwargs)
            except KeyError:
                pass  # Return message without interpolation if keys missing

        return message

    return translate


def t(key: str, locale: str = DEFAULT_LOCALE, **kwargs) -> str:
    """
    Shorthand translation function.

    Args:
        key: Message key using dot notation
        locale: Language code
        **kwargs: Values for string interpolation

    Returns:
        Translated string
    """
    translator = get_translator(locale)
    return translator(key, **kwargs)


def get_locale_from_header(accept_language: Optional[str]) -> str:
    """
    Parse Accept-Language header and return best matching locale.

    Args:
        accept_language: Value of Accept-Language HTTP header

    Returns:
        Best matching locale code
    """
    if not accept_language:
        return DEFAULT_LOCALE

    # Parse Accept-Language header (simplified)
    # Format: "cs,en-US;q=0.9,en;q=0.8"
    for part in accept_language.split(","):
        lang = part.split(";")[0].strip().lower()
        # Check exact match
        if lang in SUPPORTED_LOCALES:
            return lang
        # Check language prefix (e.g., 'cs-CZ' -> 'cs')
        lang_prefix = lang.split("-")[0]
        if lang_prefix in SUPPORTED_LOCALES:
            return lang_prefix

    return DEFAULT_LOCALE


# Re-export for convenience
__all__ = [
    "get_translator",
    "t",
    "get_locale_from_header",
    "SUPPORTED_LOCALES",
    "DEFAULT_LOCALE",
]

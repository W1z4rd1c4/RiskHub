"""Locale-independent Threat category codes and workbook import mapping."""

THREAT_CATEGORY_CODES: tuple[str, ...] = (
    "availability",
    "integrity",
    "confidentiality",
    "authenticity",
    "physical",
    "personnel",
    "third_party",
)

WORKBOOK_THREAT_CATEGORY_TO_CODE: dict[str, str] = {
    "Dostupnost": "availability",
    "Integrita": "integrity",
    "Důvěrnost": "confidentiality",
    "Hodnověrnost": "authenticity",
    "Fyzická": "physical",
    "Personální": "personnel",
    "Třetí strany": "third_party",
}


def threat_category_code(value: str) -> str:
    """Map workbook terminology to storage code, accepting an existing code idempotently."""
    if value in THREAT_CATEGORY_CODES:
        return value
    try:
        return WORKBOOK_THREAT_CATEGORY_TO_CODE[value]
    except KeyError as exc:
        raise ValueError(f"Unsupported Threat category: {value}") from exc

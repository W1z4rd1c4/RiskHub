from datetime import date

from app.core.datetime_utils import utc_now


def today() -> date:
    return utc_now().date()

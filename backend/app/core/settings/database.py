from pydantic import AliasChoices, Field

DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"


class DatabaseSettingsMixin:
    # Database
    database_url: str = DEFAULT_DATABASE_URL
    database_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL_FILE", "database_url_file"),
        exclude=True,
        repr=False,
    )

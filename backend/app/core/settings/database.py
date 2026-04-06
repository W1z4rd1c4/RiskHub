from pydantic import AliasChoices, Field


class DatabaseSettingsMixin:
    # Database
    database_url: str = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"
    database_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL_FILE", "database_url_file"),
        exclude=True,
        repr=False,
    )

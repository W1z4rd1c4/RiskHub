from pydantic import AliasChoices, Field

DEFAULT_DATABASE_URL = "postgresql+asyncpg://riskhub:riskhub@db:5432/riskhub"


class DatabaseSettingsMixin:
    # Database
    database_url: str = DEFAULT_DATABASE_URL
    e2e_sqlalchemy_echo: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("E2E_SQLALCHEMY_ECHO", "e2e_sqlalchemy_echo"),
    )
    database_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL_FILE", "database_url_file"),
        exclude=True,
        repr=False,
    )

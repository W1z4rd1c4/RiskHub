from __future__ import annotations

import pytest

from app.models import GlobalConfig
from app.services._riskhub_config.global_config import validate_global_config_value


def test_global_config_validation_raises_domain_error_with_detail():
    from app.core.exceptions import ValidationError

    config = GlobalConfig(
        key="integer_setting",
        value="3",
        value_type="int",
        category="test",
        display_name="Integer Setting",
        min_value=1,
        max_value=5,
        is_editable=True,
    )

    with pytest.raises(ValidationError) as exc_info:
        validate_global_config_value(config, "abc")

    assert exc_info.value.detail == "Value must be an integer"


@pytest.mark.asyncio
async def test_missing_role_loader_raises_not_found_domain_error(db_session):
    from app.core.exceptions import NotFoundError
    from app.services._riskhub_config.roles import load_role_for_update

    with pytest.raises(NotFoundError) as exc_info:
        await load_role_for_update(db_session, 999_999)

    assert exc_info.value.detail == "Role not found"

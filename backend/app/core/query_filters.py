from __future__ import annotations

from typing import Any

from sqlalchemy import and_, or_, true
from sqlalchemy.sql.elements import ClauseElement

from app.core.permissions import get_user_department_ids
from app.models import User, Vendor


def vendor_visibility_clause(user: User, vendor_model: Any = Vendor) -> ClauseElement:
    """
    SQL predicate equivalent of `can_read_vendor(vendor, user)` for query-time filtering.

    Rules (matches `can_read_vendor`):
    - Unassigned vendors (department_id is None): privileged users only
    - Privileged users: all vendors
    - Dept-scoped users: vendors in their department(s) OR where they are outsourcing owner
    """
    dept_ids = get_user_department_ids(user)
    if dept_ids is None:
        return true()

    base = vendor_model.department_id.is_not(None)
    if not dept_ids:
        return and_(base, vendor_model.outsourcing_owner_user_id == user.id)

    return and_(
        base,
        or_(
            vendor_model.department_id.in_(dept_ids),
            vendor_model.outsourcing_owner_user_id == user.id,
        ),
    )


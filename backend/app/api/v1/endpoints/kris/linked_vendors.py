from app.core.permissions import can_read_vendor
from app.core.security import check_permission
from app.models import User
from app.schemas.vendor_shared import LinkedVendorRead


def visible_linked_vendors(current_user: User, vendor_links) -> list[LinkedVendorRead]:
    can_read_vendors = check_permission(current_user, "vendors", "read")
    return [
        LinkedVendorRead(id=link.vendor.id, name=link.vendor.name)
        for link in vendor_links or []
        if getattr(link, "vendor", None) is not None
        and can_read_vendors
        and can_read_vendor(link.vendor, current_user)
    ]

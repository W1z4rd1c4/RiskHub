from __future__ import annotations

from app.models.vendor_sla import VendorSLA
from app.schemas.vendor_sla import VendorSLARead


def sla_to_read(sla: VendorSLA) -> VendorSLARead:
    return VendorSLARead.model_validate(sla)


from . import control_links, vendor_links
from .crud import router
from .id_generation import generate_risk_id_code

router.include_router(control_links.router)
router.include_router(vendor_links.router)

__all__ = ["generate_risk_id_code", "router"]

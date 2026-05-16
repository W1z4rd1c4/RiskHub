# Vendor Status Removal

Wave 6a item #77a soft-tolerates missing `Vendor.status` in the frontend Zod parser before the backend migration lands.

- Pre-migration: `vendorSchema.status` accepts the literal `'active'` when present and allows the field to be absent during deploy skew.
- Migration window: Wave 8 item #69+#70 removes the backend `Vendor.status` field with Alembic revision `k6l7m8n9o0p1`.
- Completed: Wave 8 item #77b removes the frontend field entirely (date to fill on commit).

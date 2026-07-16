# backend/app/api/v1/endpoints/threats

FastAPI endpoint package for the Threats domain. The router is split into focused
subrouters: `crud.py` (shared collection, standard CSV export, and
create/read/update), `lookups.py` (permission-scoped Steward, Risk, and Risk
Department filter choices), `lifecycle.py` (status and lifecycle transitions),
and `links.py` (threat-to-risk cross-entity links). These are composed in
`__init__.py` and mounted under `/api/v1` by the v1 router.

The list and export use the same plan in
`app.services._register_listings.threats`; export ignores pagination and still
applies Threat visibility plus independently readable linked-Risk context.

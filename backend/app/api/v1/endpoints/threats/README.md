# backend/app/api/v1/endpoints/threats

FastAPI endpoint package for the Threats domain. The router is split into focused
subrouters: `crud.py` (create/read/update/archive), `lifecycle.py` (status and
lifecycle transitions), and `links.py` (threat-to-risk cross-entity links). These
are composed in `__init__.py` and mounted under `/api/v1` by the v1 router.

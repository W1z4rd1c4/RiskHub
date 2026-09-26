# Identity restore security

Maintenance operations extend the existing installer and operator-managed PostgreSQL
backup workflow. Protected evidence lives outside rollback snapshots. A restored
version counter cannot establish credential freshness: every cutover replaces the
sole JWT signing key, revokes purpose/refresh state, reconciles current security
state and quarantines identities whose freshness or access cannot be established.

`files.py` handles owner-only, integrity-verified operator artifacts.
`runtime_files.py` atomically replaces installed signing authority and cutover
markers while preserving root/service ownership and read permissions. Production release remains gated by #208; #207's tests use
owned disposable infrastructure.

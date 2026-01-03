# Maintenance Perspectives: Looking Forward

Building software is a journey, and like any journey, there are areas where we are still refining the path. This guide provides a look at the "Future Maintenance" perspective of RiskHub.

## Security Horizons
We’ve built a strong fortress, but there are always more towers to build.
- **Token Handling**: We currently use a single-token JWT flow. A future improvement is to move to a "Refresh Token" system, which would allow users to stay logged in securely for longer periods without storing sensitive permanent tokens.
- **Secret Management**: While we use environment variables for keys, we aim to transition to a dedicated "Secret Vault" (like AWS Secrets Manager or HashiCorp Vault) as the platform scales to enterprise levels.

## Reliability Improvements
RiskHub is fast, but we always want it to be "Reliably Fast."
- **Persistent Scheduling**: Our scheduler currently runs in-process. In a massive, multi-server deployment, we would want to move this to a shared task queue like **Celery or Redis**, ensuring that no matter how many servers we have, a specific notification is only sent once.
- **Rate Limiting**: As we open more API endpoints, we are looking at adding per-user rate limiting to prevent any single automated script from overwhelming the system.

## Refactoring the Masterpieces
Even great art needs restoration.
- **Frontend Modularity**: Pages like the `DashboardPage` have grown large because they are the center of the user's world. We are continuously "Decomposing" these into smaller, more focused components to keep the code easy to navigate.
- **Legacy Cleanup**: Small remnants of legacy database drivers (like `sqlite`) are being systematically removed to ensure the platform is "Postgres-native" throughout.

---
*By being transparent about our technical debt, we ensure that maintenance is a deliberate act of improvement, not a reactive act of firefighting. The future of RiskHub is bright, and the path is clear.*

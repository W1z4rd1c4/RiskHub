# Phase 19: Production Deployment & Enterprise Integration

## Vision

Make RiskHub production-ready with universal deployment options, real Azure AD/Entra integration, and comprehensive documentation for all user types.

## How It Works

### Deployment
- **Universal deployment package** that runs on:
  - Docker (containerized)
  - Virtual server (bare metal/VM)
  - Azure (cloud-native)
- Production hardening (CORS, security headers, logging)
- Environment-based configuration switching

### AD Integration
- **Development**: Continue using AD Emulator (port 8001)
- **Production**: Real Azure AD / Entra ID integration
- **Authentication**: SSO login via Entra (replaces JWT mock auth)
- **User provisioning**: 
  - Manual "Pick from AD" button when adding users
  - Search Entra directory, select user, import to system
  - No automatic background sync
- **Deprovisioning**: Periodic check for deleted AD users → auto-deactivate in app

### Documentation
- **Technical deployment guide** — For IT/DevOps teams deploying the system
- **Administrator guide** — For CRO/Admin configuring the system
- **End-user guide** — For risk managers using the application daily

## What's Essential

1. Universal deployment scripts that work across Docker, VM, and Azure
2. Real Entra SSO replacing mock authentication in production
3. Manual user import from AD with search/select workflow
4. Auto-deactivation of users deleted from AD
5. All three documentation types complete and accurate

## What's Out of Scope

- i18n / localization (English only for now)
- Automatic user sync from AD
- AD Emulator replacement (keep for development)
- Mobile-specific documentation

## Suggested Plan Structure

| Plan | Focus |
|------|-------|
| 19-01 | Docker scaffolding (multi-stage builds, Compose, health checks) |
| 19-02 | VM deployment scripts (systemd, nginx, PostgreSQL setup) |
| 19-03 | Azure deployment (Bicep templates, App Service, CI/CD) |
| 19-04 | Production hardening (CORS, CSP, secrets, rate limiting) |
| 19-05 | Technical deployment documentation |
| 19-06 | Administrator guide |
| 19-07 | End-user guide |
| 19-08 | Azure AD/Entra SSO integration (MSAL, token validation) |
| 19-09 | AD user directory lookup (search, import workflow) |
| 19-10 | AD deprovisioning check (deleted user detection) |
| 19-11 | Session management (refresh tokens, sliding sessions, force logout) |
| 19-12 | End-to-End regression suite (Playwright full coverage) |
| 19-13 | Performance & load testing (Locust, benchmarks) |
| 19-14 | Automated security scanning (SAST, dependency scanning, secrets detection) |

## Open Questions

- Azure AD tenant details needed for SSO configuration
- Preferred documentation format (Markdown, PDF, hosted docs site?)
- Specific Azure resources to deploy to (App Service, Container Apps, AKS?)

---
*Discussed: 2026-01-06*

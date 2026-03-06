# RiskHub Development Makefile
# Usage: make -f scripts/Makefile <target>

.PHONY: help dev docker docker-all stop clean test migrate logs shell db-shell lint lint-frontend lint-backend quality-suppression-budget readme-coverage docs-tree-audit docs-topology-consistency verify verify-prod-install-scripts verify-setup-wizard security-contract-probe security-redis-resilience security-gap-round5 prod-readiness-audit-local release-parity-audit

# Default target
help:
	@echo "RiskHub Development Commands"
	@echo "============================"
	@echo ""
	@echo "Run as: make -f scripts/Makefile <target>"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start DB container + local backend (recommended)"
	@echo "  make dev-full     - Start DB + backend + frontend locally"
	@echo "  make docker       - Start all services via Docker"
	@echo "  make stop         - Stop all Docker containers"
	@echo ""
	@echo "Database:"
	@echo "  make db           - Start only the database container"
	@echo "  make migrate      - Run Alembic migrations"
	@echo "  make db-shell     - Open psql shell in database"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run backend tests"
	@echo "  make test-e2e     - Run Playwright E2E tests"
	@echo "  make lint         - Run frontend + backend lint"
	@echo "  make lint-frontend - Run frontend lint + typecheck + deadcode + build + debt budget"
	@echo "  make lint-backend - Run backend Ruff lint (app + tests/backend/pytest + backend/scripts) + suppression budget"
	@echo "  make quality-suppression-budget - Enforce backend/app suppression allowlist budget"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs         - Tail all Docker logs"
	@echo "  make shell        - Open shell in backend container"
	@echo "  make clean        - Remove containers, volumes, and caches"
	@echo "  make verify-prod-install-scripts - Validate Phase 500 prod scripts"
	@echo "  make verify-setup-wizard - Validate unified setup wizard scripts"
	@echo "  make readme-coverage - Audit README coverage for all in-scope folders"
	@echo "  make docs-tree-audit - Audit canonical docs-tree topology/link integrity"
	@echo "  make docs-topology-consistency - Enforce canonical docs topology + structure metrics guard"
	@echo "  make verify       - Run fast repository verification checks"
	@echo "  make security-contract-probe - Run deterministic protocol/contract drift probe harness"
	@echo "  make security-redis-resilience - Run Redis fail-closed resilience tests"
	@echo "  make security-gap-round5 - Run Round-5 targeted security gap tests"
	@echo "  make prod-readiness-audit-local - Run local production-readiness deep audit runner"
	@echo "  make release-parity-audit - Run startup/dependency release parity audit"

# =============================================================================
# Development
# =============================================================================

# Start DB + run backend locally (best for development)
dev: db migrate
	@echo "Starting backend locally..."
	@echo "Database: postgresql://riskhub:riskhub_dev@localhost:5432/riskhub"
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start DB + backend + frontend all locally
dev-full: db migrate
	@echo "Starting backend in background..."
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend..."
	cd frontend && npm run dev

# Start DB + backend + frontend for LAN access (frontend binds 0.0.0.0)
dev-full-lan: db migrate
	@echo "Starting backend in background..."
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend (LAN)..."
	cd frontend && npm run dev -- --host

# Start all services via Docker
docker:
	docker-compose up -d

# Start for LAN access (usage: make docker-lan IP=192.168.1.100)
docker-lan:
	LAN_HOST=$(IP) docker-compose up -d

# Stop all containers
stop:
	docker-compose down

# =============================================================================
# Database
# =============================================================================

# Start only database
db:
	docker-compose up -d db
	@echo "Waiting for database to be ready..."
	@sleep 3
	@docker-compose exec db pg_isready -U riskhub || (echo "DB not ready, waiting..." && sleep 5)

# Run migrations
migrate:
	cd backend && ./venv/bin/alembic upgrade head

# Open database shell
db-shell:
	docker-compose exec db psql -U riskhub -d riskhub

# =============================================================================
# Testing
# =============================================================================

# Run backend tests
test:
	cd backend && pytest -v

# Run backend tests with coverage
test-cov:
	cd backend && pytest --cov=app --cov-report=html:../tests/results/backend/coverage_html -v

# Run E2E tests
test-e2e:
	cd frontend && npx playwright test

# Run frontend lint and debt budget
lint-frontend:
	cd frontend && npm run lint && npx tsc --noEmit && npm run cleanup:deadcode && npm run build && npm run quality:debt

# Run backend lint
lint-backend:
	cd backend && ./venv/bin/python -m ruff check app ../tests/backend/pytest scripts
	python3 scripts/tools/suppression_budget.py

quality-suppression-budget:
	python3 scripts/tools/suppression_budget.py

# Run full lint suite
lint: lint-frontend lint-backend

# =============================================================================
# Utilities
# =============================================================================

# Tail Docker logs
logs:
	docker-compose logs -f

# Backend container shell
shell:
	docker-compose exec backend /bin/bash

# Clean everything
clean:
	docker-compose down -v --remove-orphans
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist backend/.coverage tests/results

# =============================================================================
# Production Deployment
# =============================================================================

verify-prod-install-scripts:
	bash -n scripts/deploy.sh scripts/deploy/lib/*.sh scripts/prod/*.sh scripts/prod/lib/*.sh scripts/release/build_linux_bundle.sh docker/redis/entrypoint.sh
	docker run --rm -v "$$(pwd)":/work -w /work koalaman/shellcheck:stable -x scripts/deploy.sh scripts/deploy/lib/*.sh scripts/prod/*.sh scripts/prod/lib/*.sh scripts/release/build_linux_bundle.sh docker/redis/entrypoint.sh
	python3 -m py_compile scripts/deploy/lib/render.py
	docker build -t riskhub-backend:verify-prod-install-scripts backend
	docker run --rm riskhub-backend:verify-prod-install-scripts sh -lc 'test -f /app/scripts/seed_roles_permissions.py && test -f /app/scripts/seed_departments.py && test -f /app/scripts/bootstrap_sso_user.py'
	docker run --rm riskhub-backend:verify-prod-install-scripts sh -lc 'python -c "import scripts.seed_roles_permissions, scripts.seed_departments, scripts.bootstrap_sso_user"'
	docker build -t riskhub-frontend:verify-prod-install-scripts frontend
	docker run --rm riskhub-frontend:verify-prod-install-scripts sh -lc 'test "$$(id -u)" != "0"'
	docker build -t riskhub-redis:verify-prod-install-scripts -f docker/redis/Dockerfile docker/redis
	docker run --rm riskhub-redis:verify-prod-install-scripts sh -lc 'test "$$(id -u)" != "0"'
	cd backend && venv/bin/pytest ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_phase500_script_contracts.py ../tests/backend/pytest/test_phase500_script_runtime_contracts.py ../tests/backend/pytest/test_deploy_renderer_contracts.py ../tests/backend/pytest/test_deploy_cli_contracts.py ../tests/backend/pytest/test_settings_secret_files.py -q

verify-setup-wizard:
	bash -n scripts/setup.sh scripts/dev_test_setup.sh
	docker run --rm -v "$$(pwd)":/work -w /work koalaman/shellcheck:stable -x scripts/setup.sh scripts/dev_test_setup.sh

readme-coverage:
	python3 scripts/tools/readme_coverage.py audit

docs-tree-audit:
	python3 scripts/tools/docs_tree_audit.py --scope canonical

docs-topology-consistency:
	python3 scripts/check_docs_contract.py
	python3 scripts/tools/readme_coverage.py audit
	python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable
	python3 scripts/tools/structure_metrics_guard.py

verify: readme-coverage

security-contract-probe:
	bash scripts/security/run_protocol_contract_probe.sh

security-redis-resilience:
	cd backend && ./venv/bin/pytest ../tests/backend/pytest/test_rate_limit_redis_resilience.py ../tests/backend/pytest/test_auth_lockout_redis_resilience.py -q

security-gap-round5:
	cd backend && ./venv/bin/pytest \
		../tests/backend/pytest/test_rate_limit_redis_resilience.py \
		../tests/backend/pytest/test_auth_lockout_redis_resilience.py \
		../tests/backend/pytest/test_protocol_parser_security.py \
		../tests/backend/pytest/test_state_machine_valid_session.py \
		../tests/backend/pytest/test_rbac_write_surface.py \
		../tests/backend/pytest/test_outbound_egress_guards.py \
		../tests/backend/pytest/test_dev_auth_boundary.py -q

prod-readiness-audit-local:
	bash scripts/security/run_prod_readiness_audit_local.sh

release-parity-audit:
	python3 scripts/security/run_release_parity_audit.py

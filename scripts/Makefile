# RiskHub Development Makefile
# Usage: make -f scripts/Makefile <target>

.PHONY: help dev dev-full docker docker-lan docker-reset stop clean test migrate logs shell db db-shell lint lint-frontend lint-backend quality-suppression-budget readme-coverage docs-tree-audit docs-topology-consistency verify verify-prod-install-scripts verify-startup-scripts security-contract-probe security-redis-resilience security-gap-round5 prod-readiness-audit-local release-parity-audit

# Default target
help:
	@echo "RiskHub Development Commands"
	@echo "============================"
	@echo ""
	@echo "Run as: make -f scripts/Makefile <target>"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start local backend only via ./scripts/dev.sh --backend"
	@echo "  make dev-full     - Start local backend + frontend via ./scripts/dev.sh"
	@echo "  make docker       - Start Docker onboarding stack via ./scripts/compose.sh up"
	@echo "  make docker-reset - Reset Docker stack with deterministic E2E data"
	@echo "  make stop         - Stop Docker dev containers"
	@echo ""
	@echo "Database:"
	@echo "  make db           - Start only DB + Redis via ./scripts/compose.sh up --profile db-only"
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
	@echo "  make verify-startup-scripts - Validate supported dev startup scripts"
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

dev:
	./scripts/dev.sh --backend

dev-full:
	./scripts/dev.sh

docker:
	./scripts/compose.sh up

docker-lan:
	./scripts/compose.sh up --lan $(IP)

docker-reset:
	./scripts/compose.sh reset --dataset test

stop:
	./scripts/compose.sh down

# =============================================================================
# Database
# =============================================================================

db:
	./scripts/compose.sh up --profile db-only

# Run migrations
migrate:
	cd backend && ./venv/bin/alembic upgrade head

# Open database shell
db-shell:
	@if docker compose version >/dev/null 2>&1; then \
		docker compose -f docker-compose.yml exec db psql -U riskhub -d riskhub; \
	elif command -v docker-compose >/dev/null 2>&1; then \
		docker-compose -f docker-compose.yml exec db psql -U riskhub -d riskhub; \
	else \
		echo "Docker Compose not found" >&2; exit 1; \
	fi

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
	./scripts/compose.sh logs

# Backend container shell
shell:
	@if docker compose version >/dev/null 2>&1; then \
		docker compose -f docker-compose.yml exec backend /bin/bash; \
	elif command -v docker-compose >/dev/null 2>&1; then \
		docker-compose -f docker-compose.yml exec backend /bin/bash; \
	else \
		echo "Docker Compose not found" >&2; exit 1; \
	fi

# Clean everything
clean:
	./scripts/compose.sh down --volumes
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
	docker build --target runtime -t riskhub-backend:verify-prod-install-scripts backend
	docker run --rm riskhub-backend:verify-prod-install-scripts sh -lc 'python -c "from pathlib import Path; assert not Path(\"/app/scripts\").exists()"'
	docker run --rm riskhub-backend:verify-prod-install-scripts sh -lc 'python -c "from pathlib import Path; root = Path(\"/app\"); hidden = sorted(str(path.relative_to(root)) for path in root.rglob(\".*\")); assert not hidden, hidden"'
	docker run --rm riskhub-backend:verify-prod-install-scripts sh -lc 'python -c "from pathlib import Path; from alembic.config import Config; assert Path(\"/app/alembic\").is_dir(); assert Path(\"/app/alembic.ini\").is_file(); import app.core.schema_guard; Config(\"/app/alembic.ini\")"'
	docker build --target dbtasks -t riskhub-backend-db:verify-prod-install-scripts backend
	docker run --rm riskhub-backend-db:verify-prod-install-scripts sh -lc 'test -f /app/scripts/seed_roles_permissions.py && test -f /app/scripts/seed_departments.py && test -f /app/scripts/bootstrap_sso_user.py'
	docker run --rm riskhub-backend-db:verify-prod-install-scripts sh -lc 'python -c "from pathlib import Path; scripts = Path(\"/app/scripts\"); expected = {\"__init__.py\", \"bootstrap_sso_user.py\", \"seed_departments.py\", \"seed_roles_permissions.py\"}; actual = {path.name for path in scripts.iterdir()}; assert actual == expected, actual"'
	docker run --rm riskhub-backend-db:verify-prod-install-scripts sh -lc 'python -c "from pathlib import Path; root = Path(\"/app\"); hidden = sorted(str(path.relative_to(root)) for path in root.rglob(\".*\")); assert not hidden, hidden"'
	docker run --rm riskhub-backend-db:verify-prod-install-scripts sh -lc 'python -c "import scripts.seed_roles_permissions, scripts.seed_departments, scripts.bootstrap_sso_user"'
	docker build -t riskhub-frontend:verify-prod-install-scripts frontend
	docker run --rm riskhub-frontend:verify-prod-install-scripts sh -lc 'test "$$(id -u)" != "0"'
	docker build -t riskhub-redis:verify-prod-install-scripts -f docker/redis/Dockerfile docker/redis
	docker run --rm riskhub-redis:verify-prod-install-scripts sh -lc 'test "$$(id -u)" != "0"'
	cd backend && venv/bin/pytest ../tests/backend/pytest/test_production_hardening.py ../tests/backend/pytest/test_phase500_script_contracts.py ../tests/backend/pytest/test_phase500_script_runtime_contracts.py ../tests/backend/pytest/test_deploy_renderer_contracts.py ../tests/backend/pytest/test_deploy_cli_contracts.py ../tests/backend/pytest/test_repo_hygiene_contracts.py ../tests/backend/pytest/test_settings_secret_files.py -q

verify-startup-scripts:
	bash -n scripts/compose.sh scripts/dev.sh
	docker run --rm -v "$$(pwd)":/work -w /work koalaman/shellcheck:stable -x scripts/compose.sh scripts/dev.sh

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

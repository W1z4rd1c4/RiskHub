# RiskHub Development Makefile
# Usage: make <target>

.PHONY: help dev docker docker-all stop clean test migrate logs shell db-shell lint lint-frontend lint-backend verify-prod-install-scripts

# Default target
help:
	@echo "RiskHub Development Commands"
	@echo "============================"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start DB container + local backend (recommended)"
	@echo "  make dev-full     - Start DB + backend + frontend locally"
	@echo "  make docker       - Start all services via Docker"
	@echo "  make docker-ad    - Start all services + AD emulator"
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
	@echo "  make lint-frontend - Run frontend ESLint + debt budget"
	@echo "  make lint-backend - Run backend Ruff lint"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs         - Tail all Docker logs"
	@echo "  make shell        - Open shell in backend container"
	@echo "  make clean        - Remove containers, volumes, and caches"
	@echo "  make verify-prod-install-scripts - Validate Phase 500 prod scripts"

# =============================================================================
# Development
# =============================================================================

# Start DB + run backend locally (best for development)
dev: db
	@echo "Starting backend locally..."
	@echo "Database: postgresql://riskhub:riskhub_dev@localhost:5432/riskhub"
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start DB + backend + frontend all locally
dev-full: db
	@echo "Starting backend in background..."
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend..."
	cd frontend && npm run dev

# Start DB + backend + frontend for LAN access (frontend binds 0.0.0.0)
dev-full-lan: db
	@echo "Starting backend in background..."
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	@echo "Starting frontend (LAN)..."
	cd frontend && npm run dev -- --host

# Start all services via Docker
docker:
	docker-compose up -d

# Start with AD emulator
docker-ad:
	docker-compose --profile with-ad up -d

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
	cd backend && alembic upgrade head

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
	cd backend && pytest --cov=app --cov-report=html -v

# Run E2E tests
test-e2e:
	cd frontend && npx playwright test

# Run frontend lint and debt budget
lint-frontend:
	cd frontend && npm run lint && npm run quality:debt

# Run backend lint
lint-backend:
	cd backend && ./venv/bin/python -m ruff check app

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
	rm -rf frontend/dist backend/.coverage coverage_html

# =============================================================================
# Phase 500 (Production Install Scripts)
# =============================================================================

verify-prod-install-scripts:
	bash -n scripts/prod/*.sh scripts/prod/lib/*.sh
	docker run --rm -v "$$(pwd)":/work -w /work koalaman/shellcheck:stable -x scripts/prod/*.sh
	cd backend && venv/bin/pytest tests/test_production_hardening.py -q

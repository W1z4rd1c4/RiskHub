#!/bin/bash
# RiskHub Development Startup Script
# Usage: ./scripts/dev.sh [options]
#
# Options:
#   --backend     Run only DB + backend (no frontend)
#   --daemon      Run backend/frontend detached with log + pid files
#   --help        Show this help message

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BACKEND_PID_FILE="$PROJECT_ROOT/.dev-backend.pid"
FRONTEND_PID_FILE="$PROJECT_ROOT/.dev-frontend.pid"
BACKEND_LOG_FILE="$PROJECT_ROOT/.dev-backend.log"
FRONTEND_LOG_FILE="$PROJECT_ROOT/.dev-frontend.log"
BACKEND_SCREEN_SESSION="riskhub-backend"
FRONTEND_SCREEN_SESSION="riskhub-frontend"

DAEMON_MODE="false"
USE_SCREEN_DAEMON="false"
NODE_MAJOR_REQUIRED="24"

print_header() {
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN} RiskHub Development Environment${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
}

show_help() {
    echo "Usage: ./scripts/dev.sh [options]"
    echo ""
    echo "Public first-run wrapper: ./scripts/install.sh dev"
    echo ""
    echo "Options:"
    echo "  (no args)   Start DB + backend + frontend locally (default)"
    echo "  --backend   Run only DB + backend (no frontend)"
    echo "  --daemon    Start local backend/frontend in detached mode"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/install.sh dev      # Public local contributor entrypoint"
    echo "  ./scripts/dev.sh              # Default: full local dev"
    echo "  ./scripts/dev.sh --backend    # Backend only (no frontend)"
    echo "  ./scripts/dev.sh --daemon     # Detached local dev with PID files"
    echo "  ./scripts/install.sh demo     # Public Docker onboarding path"
    echo "  ./scripts/compose.sh up       # Advanced/manual Docker onboarding path"
    echo "  ./scripts/compose.sh reset --dataset test  # Deterministic Docker reset"
    echo ""
    echo "Demo/dev auth defaults:"
    echo "  Local modes default to AUTH_MODE=hybrid_dev with MOCK_AUTH_ENABLED=true (demo login picker)."
    echo "  Node.js major ${NODE_MAJOR_REQUIRED} is required for CI/Docker parity."
    echo "  This script auto-prefers Homebrew/NVM Node ${NODE_MAJOR_REQUIRED} when available."
    echo "  Override example:"
    echo "    AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh"
}

sha256_of_file() {
    local target_file="$1"
    if [ ! -f "$target_file" ]; then
        echo "missing"
        return 0
    fi
    shasum -a 256 "$target_file" | awk '{print $1}'
}

node_major_from_binary() {
    local node_binary="$1"
    "$node_binary" -p "process.versions.node.split('.')[0]" 2>/dev/null || true
}

add_required_node_bin_dir_if_valid() {
    local candidate_dir="$1"
    if [ -z "$candidate_dir" ] || [ ! -d "$candidate_dir" ]; then
        return 1
    fi
    if [ ! -x "$candidate_dir/node" ] || [ ! -x "$candidate_dir/npm" ]; then
        return 1
    fi

    local candidate_major
    candidate_major="$(node_major_from_binary "$candidate_dir/node")"
    if [ "$candidate_major" != "$NODE_MAJOR_REQUIRED" ]; then
        return 1
    fi

    case ":$PATH:" in
        *":$candidate_dir:"*) ;;
        *) export PATH="$candidate_dir:$PATH" ;;
    esac
    hash -r 2>/dev/null || true
    return 0
}

configure_required_node_runtime() {
    local current_major=""
    if command -v node >/dev/null 2>&1; then
        current_major="$(node_major_from_binary "$(command -v node)")"
    fi
    if [ "$current_major" = "$NODE_MAJOR_REQUIRED" ] && command -v npm >/dev/null 2>&1; then
        return 0
    fi

    local candidate_dirs=(
        "${NODE24_BIN:-}"
        "/opt/homebrew/opt/node@24/bin"
        "/usr/local/opt/node@24/bin"
    )

    if command -v brew >/dev/null 2>&1; then
        local brew_prefix
        brew_prefix="$(brew --prefix node@24 2>/dev/null || true)"
        if [ -n "$brew_prefix" ]; then
            candidate_dirs+=("${brew_prefix}/bin")
        fi
    fi

    local nvm_candidate
    nvm_candidate="$(find "$HOME/.nvm/versions/node" -maxdepth 2 -type d -name 'v24*' 2>/dev/null | sort | head -n 1 || true)"
    if [ -n "$nvm_candidate" ]; then
        candidate_dirs+=("$nvm_candidate/bin")
    fi

    local candidate_dir
    for candidate_dir in "${candidate_dirs[@]}"; do
        if add_required_node_bin_dir_if_valid "$candidate_dir"; then
            echo -e "${YELLOW}Using Node ${NODE_MAJOR_REQUIRED} runtime from ${candidate_dir}${NC}"
            return 0
        fi
    done
}

require_node_major_runtime() {
    configure_required_node_runtime

    if ! command -v node >/dev/null 2>&1; then
        echo -e "${RED}Node.js is required but was not found in PATH.${NC}"
        echo "Install Node ${NODE_MAJOR_REQUIRED} (CI/Docker parity baseline)."
        echo "Example: brew install node@24 && export PATH=\"/opt/homebrew/opt/node@24/bin:\$PATH\""
        echo "Optional override: NODE24_BIN=/path/to/node24/bin ./scripts/dev.sh"
        exit 1
    fi
    if ! command -v npm >/dev/null 2>&1; then
        echo -e "${RED}npm is required but was not found in PATH.${NC}"
        echo "Install Node ${NODE_MAJOR_REQUIRED} (CI/Docker parity baseline)."
        exit 1
    fi

    local node_major
    node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
    if [ "$node_major" != "$NODE_MAJOR_REQUIRED" ]; then
        echo -e "${RED}Unsupported Node.js major: $(node --version 2>/dev/null || echo unknown)${NC}"
        echo "This startup path requires Node ${NODE_MAJOR_REQUIRED} to match CI/Docker parity."
        echo "Example: brew install node@24 && export PATH=\"/opt/homebrew/opt/node@24/bin:\$PATH\""
        echo "Optional override: NODE24_BIN=/path/to/node24/bin ./scripts/dev.sh"
        exit 1
    fi
}

wait_for_port() {
    local port="$1"
    local name="$2"
    local timeout="${3:-60}"

    for ((i=1; i<=timeout; i++)); do
        if lsof -i :"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            echo -e "${GREEN}${name} is ready on port ${port}${NC}"
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}${name} did not become ready on port ${port}${NC}"
    return 1
}

cleanup_stale_pid() {
    local pid_file="$1"
    if [ ! -f "$pid_file" ]; then
        return 0
    fi

    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" >/dev/null 2>&1; then
        echo -e "${YELLOW}Stopping existing process (PID ${pid}) from ${pid_file##*/}...${NC}"
        kill "$pid" >/dev/null 2>&1 || true
        sleep 1
        if kill -0 "$pid" >/dev/null 2>&1; then
            kill -9 "$pid" >/dev/null 2>&1 || true
        fi
    fi
    rm -f "$pid_file"
}

stop_screen_session() {
    local session_name="$1"
    if command -v screen >/dev/null 2>&1; then
        screen -S "$session_name" -X quit >/dev/null 2>&1 || true
    fi
}

cleanup_local_processes() {
    stop_screen_session "$BACKEND_SCREEN_SESSION"
    stop_screen_session "$FRONTEND_SCREEN_SESSION"
    cleanup_stale_pid "$BACKEND_PID_FILE"
    cleanup_stale_pid "$FRONTEND_PID_FILE"
}

stop_known_dev_listeners_on_port() {
    local port="$1"
    local name="$2"
    local allowed_regex="$3"
    local unexpected_process_marker="DEV_PORT_CONFLICT_UNEXPECTED_PROCESS"

    local pids
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -z "$pids" ]; then
        return 0
    fi

    echo -e "${YELLOW}${name} port ${port} is already in use; attempting to stop existing dev process...${NC}"
    for pid in $pids; do
        local cmd
        cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
        if echo "$cmd" | grep -Eq "$allowed_regex"; then
            kill "$pid" >/dev/null 2>&1 || true
        else
            echo -e "${RED}${unexpected_process_marker}: refusing to stop unexpected process on port ${port} (PID ${pid}).${NC}"
            echo "Command: $cmd"
            echo "Stop it manually and retry."
            exit 1
        fi
    done

    sleep 1
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "$pids" ]; then
        for pid in $pids; do
            local cmd
            cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
            if echo "$cmd" | grep -Eq "$allowed_regex"; then
                kill -9 "$pid" >/dev/null 2>&1 || true
            else
                echo -e "${RED}${unexpected_process_marker}: port ${port} is still in use by an unexpected process (PID ${pid}).${NC}"
                echo "Command: $cmd"
                echo "Stop it manually and retry."
                exit 1
            fi
        done
    fi
}

export_local_dev_env_defaults() {
    # Local dev should reliably start in demo/dev mode unless explicitly overridden.
    # This preserves Playwright E2E stability (demo login) and avoids "Login not configured".
    if [ -z "${DEBUG:-}" ]; then
        export DEBUG=true
    fi
    if [ -z "${MOCK_AUTH_ENABLED:-}" ]; then
        export MOCK_AUTH_ENABLED=true
    fi
    if [ -z "${AUTH_MODE:-}" ]; then
        export AUTH_MODE=hybrid_dev
    fi
    if [ -z "${SECRET_KEY:-}" ]; then
        export SECRET_KEY=dev-secret-key-not-for-production-use
    fi
    if [ -z "${DATABASE_URL:-}" ]; then
        export DATABASE_URL="postgresql+asyncpg://riskhub:riskhub_dev@localhost:5432/riskhub"
    fi
    if [ -z "${CORS_ORIGINS:-}" ]; then
        export CORS_ORIGINS='["http://localhost:5173","http://localhost:80","http://localhost:3000"]'
    fi
}

print_schema_preflight_failure() {
    local current_revisions="$1"
    local expected_heads="$2"
    local error_message="$3"

    echo ""
    echo -e "${RED}Database schema preflight failed.${NC}"
    if [ -n "$current_revisions" ]; then
        echo "  Current DB revision(s): $current_revisions"
    fi
    if [ -n "$expected_heads" ]; then
        echo "  Expected app head(s):  $expected_heads"
    fi
    if [ -n "$error_message" ]; then
        echo "  Error: $error_message"
    fi
    echo "  Fix:   cd backend && ./venv/bin/alembic upgrade head"
}

collect_schema_preflight_json() {
    local backend_python="$PROJECT_ROOT/backend/venv/bin/python"
    if [ ! -x "$backend_python" ]; then
        echo -e "${RED}Backend virtualenv is missing or incomplete.${NC}"
        echo "Run ./scripts/dev.sh again after the backend environment is created."
        exit 1
    fi

    local preflight_json
    if ! preflight_json="$(
        cd "$PROJECT_ROOT" && "$backend_python" - <<'PY'
import asyncio
import json
import os
import sys

from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.join(os.getcwd(), "backend"))

from app.core.schema_guard import inspect_schema_head  # noqa: E402


async def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(database_url, future=True)
    try:
        status = await inspect_schema_head(engine=engine, database_url=database_url)
        print(
            json.dumps(
                {
                    "ok": status.is_ok,
                    "current_revisions": status.current_revisions,
                    "expected_heads": status.expected_heads,
                    "error_message": status.error_message,
                }
            )
        )
    finally:
        await engine.dispose()


asyncio.run(main())
PY
    )"; then
        echo -e "${RED}Schema preflight could not be executed.${NC}"
        echo "$preflight_json"
        exit 1
    fi

    printf '%s' "$preflight_json"
}

run_schema_preflight() {
    echo -e "${YELLOW}Checking database schema revision...${NC}"

    local preflight_json
    preflight_json="$(collect_schema_preflight_json)"

    local preflight_ok
    preflight_ok="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; print("true" if json.load(sys.stdin)["ok"] else "false")')"
    local current_revisions
    current_revisions="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; values = json.load(sys.stdin)["current_revisions"]; print(", ".join(values))')"
    local expected_heads
    expected_heads="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; values = json.load(sys.stdin)["expected_heads"]; print(", ".join(values))')"
    local error_message
    error_message="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; value = json.load(sys.stdin)["error_message"]; print("" if value is None else value)')"

    if [ "$preflight_ok" != "true" ]; then
        print_schema_preflight_failure "$current_revisions" "$expected_heads" "$error_message"
        exit 1
    fi

    echo -e "${GREEN}Schema revision matches application head${NC}"
}

bootstrap_local_database() {
    echo -e "${YELLOW}Bootstrapping local database (migrations + base seed)...${NC}"
    cd backend
    # shellcheck disable=SC1091
    source venv/bin/activate
    alembic upgrade head
    python -m app.db.seed
    echo -e "${GREEN}Local database bootstrap complete!${NC}"
    cd ..
}

ensure_local_schema_ready() {
    local preflight_json
    preflight_json="$(collect_schema_preflight_json)"

    local preflight_ok
    preflight_ok="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; print("true" if json.load(sys.stdin)["ok"] else "false")')"
    if [ "$preflight_ok" = "true" ]; then
        run_schema_preflight
        return 0
    fi

    local current_revisions
    current_revisions="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; values = json.load(sys.stdin)["current_revisions"]; print(", ".join(values))')"
    local expected_heads
    expected_heads="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; values = json.load(sys.stdin)["expected_heads"]; print(", ".join(values))')"
    local error_message
    error_message="$(printf '%s' "$preflight_json" | python3 -c 'import json, sys; value = json.load(sys.stdin)["error_message"]; print("" if value is None else value)')"

    if printf '%s' "$error_message" | grep -Eq "alembic_version is empty or missing|while reading alembic_version"; then
        echo -e "${YELLOW}Detected a brand-new local database; running first-run bootstrap.${NC}"
        bootstrap_local_database
        run_schema_preflight
        return 0
    fi

    print_schema_preflight_failure "$current_revisions" "$expected_heads" "$error_message"
    exit 1
}

backend_process_alive() {
    if [ ! -f "$BACKEND_PID_FILE" ]; then
        return 1
    fi

    local pid_ref
    pid_ref="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"

    if [[ "$pid_ref" == screen:* ]]; then
        local session_name="${pid_ref#screen:}"
        screen -list 2>/dev/null | grep -q "[.]${session_name}[[:space:]]"
        return $?
    fi

    if [[ "$pid_ref" =~ ^[0-9]+$ ]]; then
        kill -0 "$pid_ref" >/dev/null 2>&1
        return $?
    fi

    return 1
}

backend_log_indicates_startup_failure() {
    tail -n 120 "$BACKEND_LOG_FILE" 2>/dev/null | grep -Eq "Application startup failed\\. Exiting\\.|Schema drift detected:"
}

wait_for_backend_ready() {
    local timeout="${1:-90}"

    for ((i=1; i<=timeout; i++)); do
        if curl -fsS --max-time 1 http://localhost:8000/api/v1/auth/config >/dev/null 2>&1; then
            echo -e "${GREEN}Backend is ready on port 8000${NC}"
            return 0
        fi

        if backend_log_indicates_startup_failure; then
            echo -e "${RED}Backend failed during startup.${NC}"
            tail -n 100 "$BACKEND_LOG_FILE" 2>/dev/null || true
            return 1
        fi

        if ! backend_process_alive; then
            echo -e "${RED}Backend process exited before becoming ready.${NC}"
            tail -n 100 "$BACKEND_LOG_FILE" 2>/dev/null || true
            return 1
        fi

        sleep 1
    done

    echo -e "${RED}Backend did not become ready on port 8000${NC}"
    tail -n 100 "$BACKEND_LOG_FILE" 2>/dev/null || true
    return 1
}

start_backend_local() {
    echo -e "${YELLOW}Starting backend...${NC}"
    : > "$BACKEND_LOG_FILE"
    if [ "$DAEMON_MODE" = "true" ] && [ "$USE_SCREEN_DAEMON" = "true" ]; then
        screen -dmS "$BACKEND_SCREEN_SESSION" bash -lc "cd '$PROJECT_ROOT/backend' && source venv/bin/activate && exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >> '$BACKEND_LOG_FILE' 2>&1"
        echo "screen:$BACKEND_SCREEN_SESSION" >"$BACKEND_PID_FILE"
    else
        cd backend
        # shellcheck disable=SC1091
        source venv/bin/activate
        nohup uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >"$BACKEND_LOG_FILE" 2>&1 &
        echo "$!" >"$BACKEND_PID_FILE"
        cd ..
    fi
}

start_frontend_local() {
    echo -e "${YELLOW}Starting frontend...${NC}"
    cd frontend

    local lock_file="package-lock.json"
    local lock_hash
    lock_hash="$(sha256_of_file "$lock_file")"
    local node_major
    node_major="$(node -p "process.versions.node.split('.')[0]")"
    local install_mode
    if [ -f "$lock_file" ]; then
        install_mode="npm_ci"
    else
        install_mode="npm_install"
    fi
    local expected_state
    expected_state="$(cat <<EOF
lock_sha256=${lock_hash}
node_major=${node_major}
install_mode=${install_mode}
EOF
)"
    local state_file="node_modules/.deps_state"
    local needs_install="false"
    if [ ! -d node_modules ] || [ ! -f "$state_file" ]; then
        needs_install="true"
    elif [ "$(cat "$state_file")" != "$expected_state" ]; then
        needs_install="true"
    fi

    if [ "$needs_install" = "true" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        if [ "$install_mode" = "npm_ci" ]; then
            npm ci
        else
            npm install
        fi
        mkdir -p node_modules
        printf '%s\n' "$expected_state" >"$state_file"
        echo -e "${GREEN}Frontend dependencies up to date!${NC}"
    else
        echo -e "${GREEN}Frontend dependencies already up to date${NC}"
    fi
    : > "$FRONTEND_LOG_FILE"
    if [ "$DAEMON_MODE" = "true" ] && [ "$USE_SCREEN_DAEMON" = "true" ]; then
        screen -dmS "$FRONTEND_SCREEN_SESSION" bash -lc "cd '$PROJECT_ROOT/frontend' && exec npm run dev >> '$FRONTEND_LOG_FILE' 2>&1"
        echo "screen:$FRONTEND_SCREEN_SESSION" >"$FRONTEND_PID_FILE"
    elif [ "$DAEMON_MODE" = "true" ]; then
        # Fallback path when screen is unavailable.
        nohup bash -lc "cd '$PROJECT_ROOT/frontend' && tail -f /dev/null | npm run dev" >"$FRONTEND_LOG_FILE" 2>&1 &
        echo "$!" >"$FRONTEND_PID_FILE"
    else
        nohup npm run dev >"$FRONTEND_LOG_FILE" 2>&1 &
        echo "$!" >"$FRONTEND_PID_FILE"
    fi
    cd ..
}

print_local_urls() {
    echo ""
    echo -e "${GREEN}Services started!${NC}"
    echo "  Frontend: http://localhost:5173"
    echo "  Backend:  http://localhost:8000"
    echo "  Database: localhost:5432"
}

print_log_hints() {
    echo ""
    echo "Logs:"
    echo "  Backend:  $BACKEND_LOG_FILE"
    echo "  Frontend: $FRONTEND_LOG_FILE"
}

start_database() {
    echo -e "${YELLOW}Starting Docker infra for local development...${NC}"
    "$PROJECT_ROOT/scripts/compose.sh" up --profile db-only
}

run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"
    cd backend
    if [ -f "alembic.ini" ]; then
        # shellcheck disable=SC1091
        source venv/bin/activate
        alembic upgrade head
        echo -e "${GREEN}Migrations complete!${NC}"
    else
        echo "No alembic.ini found, skipping migrations"
    fi
    cd ..
}

setup_backend_venv() {
    echo -e "${YELLOW}Setting up backend virtual environment...${NC}"
    cd backend
    
    # Create venv if it doesn't exist
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate and install/update dependencies
    # shellcheck disable=SC1091
    source venv/bin/activate

    # Invalidate legacy marker-only dependency cache in favor of hash-based state tracking.
    rm -f "venv/.deps_installed"

    local req_hash
    req_hash="$(sha256_of_file "requirements.txt")"
    local req_runtime_hash
    req_runtime_hash="$(sha256_of_file "requirements-runtime.txt")"
    local req_db_hash
    req_db_hash="$(sha256_of_file "requirements-db.txt")"
    local req_dev_hash
    req_dev_hash="$(sha256_of_file "requirements-dev.txt")"
    local py_major_minor
    py_major_minor="$(venv/bin/python -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
    local state_file="venv/.deps_state"
    local expected_state
    expected_state="$(cat <<EOF
requirements_sha256=${req_hash}
requirements_runtime_sha256=${req_runtime_hash}
requirements_db_sha256=${req_db_hash}
requirements_dev_sha256=${req_dev_hash}
python_major_minor=${py_major_minor}
EOF
)"

    local needs_install="false"
    if [ ! -f "$state_file" ]; then
        needs_install="true"
    elif [ "$(cat "$state_file")" != "$expected_state" ]; then
        needs_install="true"
    fi

    if [ "$needs_install" = "true" ]; then
        echo "Installing/updating Python dependencies..."
        pip install -q -r requirements.txt
        if [ -f "requirements-dev.txt" ]; then
            pip install -q -r requirements-dev.txt
        fi
        printf '%s\n' "$expected_state" >"$state_file"
        echo -e "${GREEN}Dependencies up to date!${NC}"
    else
        echo -e "${GREEN}Dependencies already up to date${NC}"
    fi
    
    cd ..
}

# Parse arguments
MODE="full"  # Default: backend + frontend

while [[ $# -gt 0 ]]; do
    case $1 in
        --backend)
            MODE="backend"
            shift
            ;;
        --daemon)
            DAEMON_MODE="true"
            shift
            ;;
        --docker|--lan)
            echo -e "${RED}Unsupported option: $1${NC}"
            echo "Use ./scripts/compose.sh for Docker-based startup."
            exit 1
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Non-interactive environments (nohup/CI/Codex) should use detached mode.
if [ "$MODE" = "full" ] && [ ! -t 1 ]; then
    DAEMON_MODE="true"
fi

if [ "$DAEMON_MODE" = "true" ] && command -v screen >/dev/null 2>&1; then
    USE_SCREEN_DAEMON="true"
fi

require_node_major_runtime

print_header

case $MODE in
    "full")
        export_local_dev_env_defaults
        start_database
        setup_backend_venv
        ensure_local_schema_ready

        cleanup_local_processes
        stop_known_dev_listeners_on_port 8000 "Backend" "(uvicorn|app\\.main:app|multiprocessing\\.spawn|RiskHub|Risk App 2)"
        stop_known_dev_listeners_on_port 5173 "Frontend" "(vite|npm run dev|node .*vite)"
        start_backend_local
        if ! wait_for_backend_ready 90; then
            exit 1
        fi
        start_frontend_local
        if ! wait_for_port 5173 "Frontend" 90; then
            tail -n 100 "$FRONTEND_LOG_FILE" 2>/dev/null || true
            exit 1
        fi

        print_local_urls
        print_log_hints

        if [ "$DAEMON_MODE" = "true" ]; then
            echo ""
            echo "Detached mode enabled."
            if [ "$USE_SCREEN_DAEMON" = "true" ]; then
                echo "  Backend session:  $BACKEND_SCREEN_SESSION"
                echo "  Frontend session: $FRONTEND_SCREEN_SESSION"
                echo "To stop: screen -S $BACKEND_SCREEN_SESSION -X quit && screen -S $FRONTEND_SCREEN_SESSION -X quit"
            else
                echo "  Backend PID:  $(cat "$BACKEND_PID_FILE")"
                echo "  Frontend PID: $(cat "$FRONTEND_PID_FILE")"
                echo "To stop: kill \$(cat .dev-backend.pid) \$(cat .dev-frontend.pid)"
            fi
            exit 0
        fi

        echo ""
        echo "Press Ctrl+C to stop backend/frontend"
        trap "cleanup_local_processes; exit" INT TERM
        wait "$(cat "$BACKEND_PID_FILE")" "$(cat "$FRONTEND_PID_FILE")"
        ;;

    "backend")
        export_local_dev_env_defaults
        start_database
        setup_backend_venv
        ensure_local_schema_ready
        cleanup_local_processes
        stop_known_dev_listeners_on_port 8000 "Backend" "(uvicorn|app\\.main:app|multiprocessing\\.spawn|RiskHub|Risk App 2)"

        echo ""
        echo -e "${YELLOW}Starting backend locally...${NC}"
        echo "  Database: postgresql://riskhub:riskhub_dev@localhost:5432/riskhub"
        echo "  Backend:  http://localhost:8000"
        echo ""

        cd backend
        # shellcheck disable=SC1091
        source venv/bin/activate
        uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
        ;;
esac

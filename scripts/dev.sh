#!/bin/bash
# RiskHub Development Startup Script
# Usage: ./scripts/dev.sh [options]
#
# Options:
#   --docker      Run everything via Docker
#   --backend     Run only DB + backend (no frontend)
#   --daemon      Run backend/frontend detached with log + pid files
#   --lan IP      Configure for LAN access with given IP
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
NODE_MAJOR_REQUIRED="20"

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
else
    echo -e "${RED}Neither docker-compose nor docker compose is available.${NC}"
    exit 1
fi

print_header() {
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN} RiskHub Development Environment${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
}

show_help() {
    echo "Usage: ./scripts/dev.sh [options]"
    echo ""
    echo "Options:"
    echo "  (no args)   Start DB + backend + frontend locally (default)"
    echo "  --backend   Run only DB + backend (no frontend)"
    echo "  --docker    Run everything via Docker Compose"
    echo "  --daemon    Start local backend/frontend in detached mode"
    echo "  --lan IP    Configure for LAN access (e.g., --lan 192.168.1.100)"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/dev.sh              # Default: full local dev"
    echo "  ./scripts/dev.sh --backend    # Backend only (no frontend)"
    echo "  ./scripts/dev.sh --daemon     # Detached local dev with PID files"
    echo "  ./scripts/dev.sh --docker     # All services in Docker"
    echo "  ./scripts/dev.sh --lan 192.168.1.100  # LAN accessible"
    echo ""
    echo "Demo/dev auth defaults:"
    echo "  Local modes default to AUTH_MODE=hybrid_dev with MOCK_AUTH_ENABLED=true (demo login picker)."
    echo "  Node.js major ${NODE_MAJOR_REQUIRED} is required for CI/Docker parity."
    echo "  Override example:"
    echo "    AUTH_MODE=password MOCK_AUTH_ENABLED=false ./scripts/dev.sh"
    exit 0
}

sha256_of_file() {
    local target_file="$1"
    if [ ! -f "$target_file" ]; then
        echo "missing"
        return 0
    fi
    shasum -a 256 "$target_file" | awk '{print $1}'
}

require_node_major_20() {
    if ! command -v node >/dev/null 2>&1; then
        echo -e "${RED}Node.js is required but was not found in PATH.${NC}"
        echo "Install Node ${NODE_MAJOR_REQUIRED} (CI/Docker parity baseline)."
        echo "Example: brew install node@20 && export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
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
        echo "Example: brew install node@20 && export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
        exit 1
    fi
}

wait_for_docker() {
    if docker info >/dev/null 2>&1; then
        return 0
    fi

    if [ "$(uname -s)" = "Darwin" ] && command -v open >/dev/null 2>&1; then
        echo -e "${YELLOW}Docker daemon is not ready. Launching Docker Desktop...${NC}"
        open -a Docker || true
    fi

    echo "Waiting for Docker daemon..."
    for i in {1..90}; do
        if docker info >/dev/null 2>&1; then
            echo -e "${GREEN}Docker daemon is ready!${NC}"
            return 0
        fi
        sleep 2
    done

    echo -e "${RED}Docker daemon is unavailable. Start Docker and retry.${NC}"
    exit 1
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
            echo -e "${RED}Refusing to stop unexpected process on port ${port} (PID ${pid}).${NC}"
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
                echo -e "${RED}Port ${port} is still in use by an unexpected process (PID ${pid}).${NC}"
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

start_backend_local() {
    echo -e "${YELLOW}Starting backend...${NC}"
    : > "$BACKEND_LOG_FILE"
    if [ "$DAEMON_MODE" = "true" ] && [ "$USE_SCREEN_DAEMON" = "true" ]; then
        screen -dmS "$BACKEND_SCREEN_SESSION" bash -lc "cd '$PROJECT_ROOT/backend' && source venv/bin/activate && exec uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 >> '$BACKEND_LOG_FILE' 2>&1"
        echo "screen:$BACKEND_SCREEN_SESSION" >"$BACKEND_PID_FILE"
    else
        cd backend
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
    wait_for_docker
    echo -e "${YELLOW}Starting PostgreSQL database...${NC}"
    "${COMPOSE_CMD[@]}" up -d db
    
    echo "Waiting for database to be ready..."
    for i in {1..30}; do
        if "${COMPOSE_CMD[@]}" exec -T db pg_isready -U riskhub > /dev/null 2>&1; then
            echo -e "${GREEN}Database is ready!${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}Database failed to start${NC}"
    exit 1
}

run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"
    cd backend
    if [ -f "alembic.ini" ]; then
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
    source venv/bin/activate

    # Invalidate legacy marker-only dependency cache in favor of hash-based state tracking.
    rm -f "venv/.deps_installed"

    local req_hash
    req_hash="$(sha256_of_file "requirements.txt")"
    local req_dev_hash
    req_dev_hash="$(sha256_of_file "requirements-dev.txt")"
    local py_major_minor
    py_major_minor="$(venv/bin/python -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
    local state_file="venv/.deps_state"
    local expected_state
    expected_state="$(cat <<EOF
requirements_sha256=${req_hash}
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
LAN_IP=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --backend)
            MODE="backend"
            shift
            ;;
        --docker)
            MODE="docker"
            shift
            ;;
        --daemon)
            DAEMON_MODE="true"
            shift
            ;;
        --lan)
            MODE="lan"
            LAN_IP="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
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

require_node_major_20

print_header

case $MODE in
    "docker")
        wait_for_docker
        echo -e "${YELLOW}Starting all services via Docker...${NC}"
        "${COMPOSE_CMD[@]}" up -d
        echo ""
        echo -e "${GREEN}Services started!${NC}"
        echo "  Frontend: http://localhost:80"
        echo "  Backend:  http://localhost:8000"
        echo "  Database: localhost:5432"
        ;;
    
	    "full")
	        export_local_dev_env_defaults
	        start_database
	        setup_backend_venv
	        run_migrations

	        cleanup_local_processes
	        stop_known_dev_listeners_on_port 8000 "Backend" "(uvicorn|app\\.main:app|multiprocessing\\.spawn|RiskHub|Risk App 2)"
	        stop_known_dev_listeners_on_port 5173 "Frontend" "(vite|npm run dev|node .*vite)"
	        start_backend_local
	        start_frontend_local

	        if ! wait_for_port 8000 "Backend" 90; then
	            tail -n 100 "$BACKEND_LOG_FILE" 2>/dev/null || true
            exit 1
        fi
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
    
    "lan")
        if [ -z "$LAN_IP" ]; then
            echo -e "${RED}Error: --lan requires an IP address${NC}"
            echo "Usage: ./scripts/dev.sh --lan 192.168.1.100"
            exit 1
        fi
        
        echo -e "${YELLOW}Starting for LAN access on $LAN_IP...${NC}"
        wait_for_docker
        LAN_HOST="$LAN_IP" "${COMPOSE_CMD[@]}" up -d
        
        echo ""
        echo -e "${GREEN}Services started for LAN access!${NC}"
        echo "  Frontend: http://$LAN_IP:80"
        echo "  Backend:  http://$LAN_IP:8000"
        echo "  Database: $LAN_IP:5432"
        ;;
    
	    "backend")
	        # Backend only mode
	        export_local_dev_env_defaults
	        start_database
	        setup_backend_venv
	        run_migrations
	        cleanup_local_processes
	        stop_known_dev_listeners_on_port 8000 "Backend" "(uvicorn|app\\.main:app|multiprocessing\\.spawn|RiskHub|Risk App 2)"
	        
	        echo ""
	        echo -e "${YELLOW}Starting backend locally...${NC}"
	        echo "  Database: postgresql://riskhub:riskhub_dev@localhost:5432/riskhub"
        echo "  Backend:  http://localhost:8000"
        echo ""
        
        cd backend
        source venv/bin/activate
        uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
        ;;
esac

#!/bin/bash
# RiskHub Development Startup Script
# Usage: ./scripts/dev.sh [options]
#
# Options:
#   --docker      Run everything via Docker
#   --backend     Run only DB + backend (no frontend)
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
    echo "  --lan IP    Configure for LAN access (e.g., --lan 192.168.1.100)"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/dev.sh              # Default: full local dev"
    echo "  ./scripts/dev.sh --backend    # Backend only (no frontend)"
    echo "  ./scripts/dev.sh --docker     # All services in Docker"
    echo "  ./scripts/dev.sh --lan 192.168.1.100  # LAN accessible"
    exit 0
}

start_database() {
    echo -e "${YELLOW}Starting PostgreSQL database...${NC}"
    docker-compose up -d db
    
    echo "Waiting for database to be ready..."
    for i in {1..30}; do
        if docker-compose exec -T db pg_isready -U riskhub > /dev/null 2>&1; then
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
    
    # Quick check if requirements need updating (compare timestamps)
    if [ "requirements.txt" -nt "venv/.deps_installed" ] 2>/dev/null || [ ! -f "venv/.deps_installed" ]; then
        echo "Installing/updating Python dependencies..."
        pip install -q -r requirements.txt
        touch venv/.deps_installed
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

print_header

case $MODE in
    "docker")
        echo -e "${YELLOW}Starting all services via Docker...${NC}"
        docker-compose up -d
        echo ""
        echo -e "${GREEN}Services started!${NC}"
        echo "  Frontend: http://localhost:80"
        echo "  Backend:  http://localhost:8000"
        echo "  Database: localhost:5432"
        ;;
    
    "full")
        start_database
        setup_backend_venv
        run_migrations
        
        echo -e "${YELLOW}Starting backend...${NC}"
        cd backend
        source venv/bin/activate
        uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
        BACKEND_PID=$!
        cd ..
        
        echo -e "${YELLOW}Starting frontend...${NC}"
        cd frontend
        npm run dev &
        FRONTEND_PID=$!
        cd ..
        
        echo ""
        echo -e "${GREEN}Services started!${NC}"
        echo "  Frontend: http://localhost:5173"
        echo "  Backend:  http://localhost:8000"
        echo "  Database: localhost:5432"
        echo ""
        echo "Press Ctrl+C to stop all services"
        
        trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
        wait
        ;;
    
    "lan")
        if [ -z "$LAN_IP" ]; then
            echo -e "${RED}Error: --lan requires an IP address${NC}"
            echo "Usage: ./scripts/dev.sh --lan 192.168.1.100"
            exit 1
        fi
        
        echo -e "${YELLOW}Starting for LAN access on $LAN_IP...${NC}"
        LAN_HOST="$LAN_IP" docker-compose up -d
        
        echo ""
        echo -e "${GREEN}Services started for LAN access!${NC}"
        echo "  Frontend: http://$LAN_IP:80"
        echo "  Backend:  http://$LAN_IP:8000"
        echo "  Database: $LAN_IP:5432"
        ;;
    
    "backend")
        # Backend only mode
        start_database
        setup_backend_venv
        run_migrations
        
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

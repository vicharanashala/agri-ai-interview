#!/bin/bash

# ============================================
# AI Interview Platform - Start Script
# ============================================
# Run: sh scripts/start.sh
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting AI Interview Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if port 3000 is in use
check_port() {
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port 3000 is already in use. Frontend may fail to start.${NC}"
    fi
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port 8000 is already in use. Backend may fail to start.${NC}"
    fi
}

# Install backend dependencies if needed
install_backend() {
    echo -e "${GREEN}📦 Checking backend dependencies...${NC}"
    cd "$PROJECT_DIR/backend"
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo -e "${GREEN}✅ Backend dependencies ready${NC}"
}

# Install frontend dependencies if needed
install_frontend() {
    echo -e "${GREEN}📦 Checking frontend dependencies...${NC}"
    cd "$PROJECT_DIR/frontend"
    if [ ! -d "node_modules" ]; then
        echo "Installing npm packages..."
        npm install
    fi
    echo -e "${GREEN}✅ Frontend dependencies ready${NC}"
}

# Kill existing processes on these ports (optional cleanup)
cleanup_ports() {
    echo -e "${YELLOW}🧹 Checking for existing servers...${NC}"
    # Uncomment below to auto-kill existing processes
    # lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    # lsof -ti:8000 | xargs kill -9 2>/dev/null || true
}

# Start backend server
start_backend() {
    echo -e "${GREEN}🔧 Starting Backend (FastAPI on port 8000)...${NC}"
    cd "$PROJECT_DIR/backend"
    source venv/bin/activate
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
    echo $! > /tmp/backend.pid
    echo -e "${GREEN}✅ Backend started on http://localhost:8000${NC}"
}

# Start frontend server
start_frontend() {
    echo -e "${GREEN}🔧 Starting Frontend (Next.js on port 3000)...${NC}"
    cd "$PROJECT_DIR/frontend"
    npm run dev -- -p 3000 &
    echo $! > /tmp/frontend.pid
    echo -e "${GREEN}✅ Frontend started on http://localhost:3000${NC}"
}

# Open browser
open_browser() {
    echo -e "${GREEN}🌐 Opening browser...${NC}"
    sleep 3  # Give servers time to start
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:3000"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "http://localhost:3000"
    fi
}

# Cleanup function
cleanup() {
    echo -e "${YELLOW}🛑 Stopping servers...${NC}"
    if [ -f /tmp/backend.pid ]; then
        kill $(cat /tmp/backend.pid) 2>/dev/null || true
        rm /tmp/backend.pid
    fi
    if [ -f /tmp/frontend.pid ]; then
        kill $(cat /tmp/frontend.pid) 2>/dev/null || true
        rm /tmp/frontend.pid
    fi
    echo -e "${GREEN}✅ Servers stopped${NC}"
}

# Main execution
main() {
    check_port
    install_backend
    install_frontend
    
    # Start servers
    start_backend
    sleep 2
    start_frontend
    
    # Open browser
    open_browser
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}🎉 AI Interview Platform is running!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "Frontend: ${GREEN}http://localhost:3000${NC}"
    echo -e "Backend:  ${GREEN}http://localhost:8000${NC}"
    echo -e "API Docs: ${GREEN}http://localhost:8000/docs${NC}"
    echo ""
    echo "Press Ctrl+C to stop"
    echo -e "${GREEN}========================================${NC}"
    
    # Handle cleanup on exit
    trap cleanup EXIT
    
    # Wait for any background process
    wait
}

main "$@"
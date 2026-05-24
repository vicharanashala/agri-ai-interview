#!/bin/bash
# =============================================================================
# Agri-AI Interview Platform — Quick Setup Script
# =============================================================================
# Usage:
#   ./setup.sh          # Interactive mode
#   ./setup.sh --docker # Run with Docker
#   ./setup.sh --local  # Run locally (no Docker)
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd "$(dirname "$0")"

# =============================================================================
# Helper functions
# =============================================================================

info()    { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo ""; echo "=============================================="; echo " $1"; echo "=============================================="; }

# =============================================================================
# Mode selection
# =============================================================================

MODE=""
if [ "$1" = "--docker" ]; then
  MODE="docker"
elif [ "$1" = "--local" ]; then
  MODE="local"
elif command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
  echo ""
  echo "  1) Run with Docker (recommended)"
  echo "  2) Run locally (requires Python 3.11 + Node 20)"
  echo ""
  read -p "Choose [1]: " choice
  MODE=$([[ "$choice" == "2" ]] && echo "local" || echo "docker")
else
  MODE="local"
fi

# =============================================================================
# Docker mode
# =============================================================================

docker_setup() {
  section "Docker Setup"

  # Build and start
  info "Building Docker images..."
  docker-compose build

  info "Starting services..."
  docker-compose up -d

  info "Setup complete!"
  echo ""
  echo "  Frontend:  http://localhost:3000"
  echo "  Backend:   http://localhost:8000"
  echo "  API Docs:  http://localhost:8000/docs"
  echo ""
  info "Run './setup.sh --docker down' to stop"
}

docker_down() {
  info "Stopping Docker services..."
  docker-compose down
  info "Done."
}

# =============================================================================
# Local mode
# =============================================================================

local_setup() {
  section "Local Setup"

  # Detect OS
  OS="$(uname -s)"
  info "Detected OS: $OS"

  # =============================================================================
  # Backend
  # =============================================================================
  section "Backend Setup"

  ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
  BACKEND_DIR="$ROOT_DIR/backend"
  FRONTEND_DIR="$ROOT_DIR/frontend"

  # Python virtual env
  if [ ! -d "venv" ]; then
    info "Creating Python venv..."
    python3 -m venv venv
  fi

  info "Installing Python dependencies..."
  source venv/bin/activate
  pip install -r requirements.txt --quiet

  # Environment file
  if [ ! -f ".env" ]; then
    info "Creating backend .env..."
    cat > .env << 'EOF'
DATABASE_URL=sqlite:///./annam_interviews.db
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_api_key_here
SECRET_KEY=change-this-to-a-random-secret-key
ADMIN_EMAIL=admin@annam.com
ADMIN_PASSWORD=admin123
EOF
    warn "Created backend/.env — please add your OPENAI_API_KEY"
  fi

  # Initialize database (create tables if they don't exist)
  info "Initializing database..."
  python -c "
import sqlite3, os
db = 'annam_interviews.db'
if not os.path.exists(db):
    sqlite3.connect(db)
    print('Created', db)
else:
    print('Already exists:', db)
"

  cd "$BACKEND_DIR"
  info "Starting backend on port 8000..."
  source venv/bin/activate
  nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 > "$ROOT_DIR/backend.log" 2>&1 &
  echo $! > "$ROOT_DIR/backend.pid"
  info "Backend PID: $(cat "$ROOT_DIR/backend.pid")"

  # =============================================================================
  # Frontend
  # =============================================================================
  section "Frontend Setup"

  cd "$FRONTEND_DIR"

  # Node modules
  if [ ! -d "node_modules" ]; then
    info "Installing Node dependencies..."
    npm install
  fi

  # Prisma
  info "Generating Prisma client..."
  npx prisma generate --quiet

  # Environment file
  if [ ! -f ".env.local" ]; then
    info "Creating frontend .env.local..."
    cat > .env.local << 'EOF'
DATABASE_URL=file:./prisma/dev.db
NEXTAUTH_SECRET=change-this-to-a-random-secret
NEXTAUTH_URL=http://localhost:3000
EOF
    warn "Created frontend/.env.local — update NEXTAUTH_SECRET for production"
  fi

  # Push Prisma schema
  info "Setting up Prisma database..."
  npx prisma db push --quiet

  info "Starting frontend on port 3000..."
  nohup npm start > "$ROOT_DIR/frontend.log" 2>&1 &
  echo $! > "$ROOT_DIR/frontend.pid"
  info "Frontend PID: $(cat "$ROOT_DIR/frontend.pid")"

  # =============================================================================
  # Done
  # =============================================================================
  section "All Done! 🚀"

  echo ""
  echo "  Frontend:  http://localhost:3000"
  echo "  Backend:   http://localhost:8000"
  echo "  API Docs:  http://localhost:8000/docs"
  echo ""
  echo "  Logs:"
  echo "    Backend:  tail -f backend.log"
  echo "    Frontend: tail -f frontend.log"
  echo ""
  echo "  Stop:"
  echo "    kill \$(cat backend.pid) \$(cat frontend.pid)"
  echo ""
}

# =============================================================================
# Run
# =============================================================================

if [ "$MODE" = "docker" ]; then
  if [ "$2" = "down" ]; then
    docker_down
  else
    docker_setup
  fi
elif [ "$MODE" = "local" ]; then
  local_setup
fi
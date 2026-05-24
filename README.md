# Agri-AI Interview Platform

AI-powered interview platform for agriculture domain candidates. Handles end-to-end hiring — onboarding, AI interviews, evaluation, and offer management.

## 🚀 Quick Start

### Option 1 — Docker (Recommended)

```bash
git clone https://github.com/vicharanashala/agri-ai-interview.git
cd agri-ai-interview
./setup.sh --docker
```

Opens at **http://localhost:3000** (frontend) · **http://localhost:8000/docs** (API)

To stop: `./setup.sh --docker down`

### Option 2 — Local (no Docker)

```bash
git clone https://github.com/vicharanashala/agri-ai-interview.git
cd agri-ai-interview
./setup.sh --local
```

Requires: **Python 3.11+** and **Node 20+**

---

## 🔑 First Login

- **Candidate portal**: http://localhost:3000 → Sign up
- **Admin dashboard**: http://localhost:3000/admin/login
  - Email: `admin@annam.com`
  - Password: `admin123`

> ⚠️ Change `ADMIN_PASSWORD` in `backend/.env` before deploying.

---

## 📁 Project Structure

```
├── backend/                  # FastAPI + LangGraph
│   ├── app/
│   │   ├── api/             # API routes (interview, admin, faq, offer)
│   │   ├── core/            # Auth, config, security
│   │   ├── db/              # Database models + migrations
│   │   ├── llm/             # LLM service + prompts
│   │   ├── services/        # Business logic (resume, evaluation)
│   │   └── workflows/       # LangGraph interview + state machines
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Next.js 15 (App Router)
│   ├── app/                  # Pages (onboarding, interview, dashboard, admin, faq)
│   ├── components/           # React components + IndiaMap
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Prisma client, auth config
│   ├── prisma/               # Prisma schema + SQLite dev DB
│   ├── Dockerfile
│   └── package.json
│
├── infra/                    # Kubernetes / production configs
├── scripts/                  # Utility scripts
├── tasks/                    # Feature specs (TASK-*.md)
├── docker-compose.yml
├── setup.sh                  # One-script setup
└── README.md
```

---

## 🧩 Features

| Module | Description |
|--------|-------------|
| **Onboarding** | Multi-step form — personal, location, farming background |
| **AI Interview** | LangGraph-powered conversational interview with phase transitions |
| **Resume Parser** | Upload and parse candidate resumes (TASK-009) |
| **Evaluation Engine** | Score candidates by criteria + guidelines |
| **FAQ Assistant** | RAG-based FAQ bot with custom PDF context |
| **Admin Dashboard** | Stats, geographic maps, live interviews, funnel analytics |
| **Anti-Cheating** | Tab-switch detection, focus monitoring (TASK-008) |
| **Offer Flow** | Generate and track offer letters (TASK-007) |

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=sqlite:///./annam_interviews.db    # or postgresql://...
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=***                            # required
SECRET_KEY=change…cret
ADMIN_EMAIL=admin@annam.com
ADMIN_PASSWORD=admin123
```

### Frontend (`frontend/.env.local`)

```env
DATABASE_URL=file:./prisma/dev.db
NEXTAUTH_SECRET=***
NEXTAUTH_URL=http://localhost:3000
```

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend  │────▶│   FastAPI   │────▶│  LangGraph   │
│  (Next.js)  │     │  (Backend)  │     │  (AI Flow)   │
│   :3000     │     │   :8000     │     │              │
└─────────────┘     └──────┬──────┘     └──────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
        ┌──────────┐           ┌──────────┐
        │ SQLite / │           │  Redis   │
        │ Postgres │           │ (Cache)  │
        └──────────┘           └──────────┘
```

**Interview Flow:**
1. Candidate completes onboarding → stored in Prisma
2. `POST /api/interview/start` → initializes LangGraph workflow
3. Each answer → `POST /api/interview/message` → `process_answer()` → phase transition
4. End of interview → evaluation scored via LLM
5. Admin reviews in dashboard → extends offer

---

## 🔌 API Reference

Full docs at **http://localhost:8000/docs**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/interview/start` | Start a new interview session |
| `POST` | `/api/interview/message` | Send a message/answer |
| `GET`  | `/api/interview/history/:session_id` | Get conversation history |
| `GET`  | `/api/admin/candidates` | List all candidates |
| `GET`  | `/api/admin/stats` | Dashboard statistics |
| `GET`  | `/api/admin/stats/geographic` | Geographic distribution |
| `POST` | `/api/admin/auth/login` | Admin login |
| `POST` | `/api/faq/query` | Query the FAQ bot |
| `POST` | `/api/offer/generate` | Generate offer letter |

---

## 🐳 Docker Cheat Sheet

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild after code changes
docker-compose build --no-cache

# Stop everything
docker-compose down

# Restart a specific service
docker-compose restart backend
```

---

## 👤 Development

```bash
# Backend (separate terminal)
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm run dev

# Run tests
cd backend && pytest
cd frontend && npm test

# Lint
cd backend && flake8 .
cd frontend && npm run lint
```

---

## 📜 License

Apache 2.0 — see [LICENSE](./LICENSE)
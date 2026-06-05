# Agri-Agri AI Interview Platform

AI-powered interview platform for agriculture domain candidates. Handles end-to-end hiring — onboarding, AI interviews, evaluation, and offer management.

## 🚀 Quick Start

### Option 1 — Docker (Recommended)

```bash
git clone https://github.com/vicharanashala/agri-ai-interview.git
cd agri-ai-interview

# Create production env file from template
cp .env.prod.example .env.prod
# Edit .env.prod and fill in your real secrets

docker-compose up -d
```

Opens at **http://localhost:3000** (frontend) · **http://localhost:8000/docs** (API)

To stop: `docker-compose down`
To rebuild: `docker-compose build --no-cache && docker-compose up -d`

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

> ⚠️ Never commit `.env.prod` — it is gitignored. Use `.env.prod.example` as a template.

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
│   ├── prisma/               # Prisma schema + PostgreSQL (via Docker volume)
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

All secrets are stored in `.env.prod` (gitignored — never pushed to GitHub).

### Setup

```bash
# 1. Create .env.prod from the template
cp .env.prod.example .env.prod

# 2. Fill in your real values
nano .env.prod

# 3. For GCP Secret Manager (optional — production)
gcloud secrets create OPENAI_API_KEY --data-file=- <<< "sk-..."
```

### `.env.prod` Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@postgres:5432/ai_interview` |
| `SECRET_KEY` | FastAPI auth signing key | 64-char random string |
| `ADMIN_EMAIL` | Admin login email | `admin@annam.com` |
| `ADMIN_PASSWORD` | Admin login password | `change-this` |
| `NEXTAUTH_URL` | Frontend URL | `http://localhost:3000` |
| `NEXTAUTH_SECRET` | NextAuth signing secret | 32-char random string |

> **For production on GCP**: store secrets in [GCP Secret Manager](https://cloud.google.com/security/products/secret-manager) and fetch at container startup — see [GCP Secret Manager integration](#gcp-secret-manager) below.

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
        │ PostgreSQL │           │  Redis   │
        │   (SQLAlchemy)       │ (Cache)  │
        └──────────┘           └──────────┘
```

**Interview Flow:**
1. Candidate completes onboarding → stored in Prisma (PostgreSQL)
2. `POST /api/interview/start` → initializes LangGraph workflow
3. Each answer → `POST /api/interview/message` → `process_answer()` → phase transition
4. End of interview → evaluation scored via LLM
5. Admin reviews in dashboard → extends offer

**Named Volumes (Docker):**
- `backend_uploads` — uploaded resumes and files
- (removed — Prisma now uses the shared PostgreSQL instance)
- `redis_data` — Redis cache

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
# Start everything (first time — builds images)
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild after code changes
docker-compose build --no-cache && docker-compose up -d

# Stop everything
docker-compose down

# Restart a specific service
docker-compose restart backend

# Clean slate (removes volumes — WARNING: deletes data)
docker-compose down -v
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

## 🔐 Secrets & Security

### Local Development

- `.env` / `.env.local` — gitignored, never pushed
- `.env.prod.example` — template with placeholder values, pushed to GitHub

### Production (GCP)

Store secrets in **GCP Secret Manager**:

```bash
# Create secrets
gcloud secrets create OPENAI_API_KEY --data-file=- <<< "sk-..."
gcloud secrets create ADMIN_PASSWORD --data-file=- <<< "your-secure-password"
gcloud secrets create NEXTAUTH_SECRET --data-file=- <<< "your-32-char-secret"
```

Fetch at container startup via init container or entrypoint script:

```bash
# In your Cloud Run / GKE deployment
kubectl create secret generic app-secrets \
  --from-literal=OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY)
```

### GitHub Actions → GCP (OIDC — no secrets stored)

```yaml
# .github/workflows/deploy.yml
- id: auth
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: "projects/xxx/locations/global/workloadIdentityPools/yyy"
    service_account: "deploy@xxx.iam.gserviceaccount.com"
```

No long-lived tokens needed — uses OIDC token exchange.

---

## 📜 License

Apache 2.0 — see [LICENSE](./LICENSE)
# MongoDB Migration Tracker

**Goal:** Replace PostgreSQL + Redis with MongoDB Atlas (only DB purchased on GCP).

**Status:** Not started

---

## Changes Needed

### Dependencies
- [ ] `requirements.txt` — remove `sqlalchemy asyncpg psycopg2-binary redis alembic`, add `motor pymongo`

### Config
- [ ] `config.py` — replace `DATABASE_URL`/`REDIS_URL` with `MONGO_URI`/`MONGO_DB_NAME`
- [ ] `.env` / `stack.env` — update env vars

### Storage Layer
- [ ] Delete `backend/app/db/database.py` → replace with `backend/app/db/mongodb.py` (Motor async + PyMongo sync client)
- [ ] Delete `backend/app/core/redis.py`
- [ ] Delete `backend/app/db/models/` (all SQLAlchemy models)
- [ ] Create `backend/app/db/schemas/` with MongoDB document schemas (reference only, no ORM)

### Session Store
- [ ] Create `backend/app/core/session.py` — `MongoSessionStore` replacing Redis (get/set/delete/find_by_token_hash, TTL index)
- [ ] `backend/app/api/candidate/session.py` — swap Redis for MongoSessionStore
- [ ] `backend/app/middleware/candidate_auth.py` — swap Redis scan for MongoDB find_one

### Services
- [ ] `backend/app/services/settings_service.py` — all `db.query(Settings)` → MongoDB find/update (sync PyMongo)
- [ ] `backend/app/services/queue_manager.py` — `ActiveInterviewCount` → `counters` collection, `InterviewQueueEntry` → `queue_entries` collection
- [ ] `backend/app/services/email_service.py` — SQL join → two MongoDB queries
- [ ] `backend/app/services/gcs_service.py` (new) — GCS upload/download for resumes, documents, PDFs

### Workflows
- [ ] `backend/app/workflows/interview_workflow.py` — DB fallback path → MongoDB
- [ ] `backend/app/workflows/interview_graph.py` — `_persist_evaluation` → MongoDB

### API Routes
- [ ] `backend/app/api/candidate/route.py` — Redis reads → remove, DB → MongoDB
- [ ] `backend/app/api/admin/candidates.py` — all joins → MongoDB queries/$lookup
- [ ] `backend/app/api/admin/settings.py` — Settings → MongoDB
- [ ] `backend/app/api/admin/documents.py` — docs → MongoDB
- [ ] `backend/app/api/interview/route.py` — session ops → MongoDB
- [ ] `backend/app/api/anti_cheat.py` — AntiCheatEvent insert → MongoDB
- [ ] `backend/app/api/offer.py` — joins → two queries
- [ ] `backend/app/api/joining_details.py` — same
- [ ] `backend/app/api/resume/route.py` — GCS upload + MongoDB metadata

### Docker
- [ ] `docker-compose.yml` — remove `postgres` and `redis` services, update backend env vars
- [ ] `docker-compose.dev.yml` — remove PG/Redis, add GCS emulator for local testing

### Data Migration Scripts
- [ ] `scripts/export_pg.py` — export all PG tables to JSON
- [ ] `scripts/import_to_mongo.py` — import JSON to MongoDB Atlas with field renames + indexes

---

## MongoDB Collections (target schema)

| Collection | Replaces |
|---|---|
| `users` | User table |
| `candidates` | Candidate table |
| `interview_sessions` | InterviewSession, InterviewStateSnapshot, queue entries |
| `anti_cheat_events` | AntiCheatEvent table |
| `settings` | Settings table |
| `resumes` | Resume table |
| `candidate_documents` | CandidateDocument table |
| `signed_offer_letters` | SignedOfferLetter table |
| `sessions` | Redis session store |
| `counters` | ActiveInterviewCount, slot tracking |

**File storage:** GCS (not MongoDB) for resumes, PDFs, documents.

---

## What's Done

Nothing yet. All items above are pending.
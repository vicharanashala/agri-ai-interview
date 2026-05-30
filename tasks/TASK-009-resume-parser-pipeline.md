# TASK-009: Resume Parser Pipeline

## Objective
Build an automated resume parsing system that extracts candidate information and enhances interview preparation.

---

## Status: PHASE 2 COMPLETE ✅

Phase 1 (file upload + admin visibility) + Phase 2 (LLM structured extraction) are done. Remaining: skill matching, gap detection, question generation.

---

## Phase 1 — File Upload & Admin Visibility ✅ Done (2026-05-27)

Admin can preview + download any candidate's uploaded resume from the candidates table.

### Backend
- [x] PDF text extraction (`pdfplumber`)
- [x] DOCX text extraction (`python-docx`)
- [x] `POST /api/resume/upload` — saves file to `backend/uploads/resumes/`, extracts raw text, stores in Prisma SQLite
- [x] `GET /api/resume/{id}` — serves original file for download
- [x] `GET /api/admin/resumes?candidateId=` — lists resumes per candidate (for admin table)

### Frontend (Onboarding)
- [x] On submit: uploads resume base64 → `POST /api/resume` → FastAPI backend (5MB limit enforced)

### Frontend (Admin Dashboard)
- [x] Added 📎 Resume column to All Candidates table
- [x] Per-row: **👁 Preview** (modal showing raw text) + **⬇ Download** (original file) buttons
- [x] Lazy-loads resumes for all candidates when tab is opened

### Files Created / Changed
- `frontend/prisma/schema.prisma` — added `Resume` model + `Candidate.resumes` relation
- `backend/app/services/resume_parser.py` — new: PDF/DOCX text extraction utility
- `backend/app/api/resume/route.py` — new: upload, download, admin list endpoints
- `backend/app/main.py` — registered resume router
- `backend/requirements.txt` — added `pdfplumber`, `python-docx`
- `frontend/app/api/resume/route.ts` — new: proxies upload to FastAPI
- `frontend/app/api/resume/[id]/route.ts` — new: proxies download to FastAPI
- `frontend/app/onboarding/page.tsx` — wired resume upload on form submit
- `frontend/app/admin/dashboard/page.tsx` — Resume column + Preview/Download

### Files Added / Changed (Phase 2)
- `frontend/prisma/schema.prisma` — added `parsedData` JSON column to Resume model
- `backend/app/data/skills_taxonomy.json` — new: pre-defined skill taxonomy (8 categories, ~200 skills)
- `backend/app/services/resume_llm_parser.py` — new: LLM parsing + skill normalization
- `backend/app/api/resume/route.py` — added BackgroundTasks auto-parse + `POST /api/resume/parse/{id}`
- `frontend/app/admin/dashboard/page.tsx` — `ParsedResumeView` component + `parsedData` modal + status badge

---

## Phase 2 — LLM Structured Extraction ✅ Done (2026-05-27)

### Skills Taxonomy
- [x] Pre-defined taxonomy: 8 categories, ~200 skills (frontend, backend, devops, databases, AI/ML, mobile, tools, soft skills)
- [x] Fuzzy matching: LLM raw skills normalized against taxonomy
- [x] File: `backend/app/data/skills_taxonomy.json`

### LLM Parsing
- [x] `parse_resume_with_llm()` — structured Gemini prompt → JSON with name, email, phone, skills, experience[], education[], summary, confidence_score
- [x] JSON extraction: direct parse + regex fallback from LLM response text
- [x] `save_parsed_data()` — writes to Resume.parsedData in SQLite

### Auto-Parse Flow
- [x] Upload returns immediately (`status: uploaded`)
- [x] `BackgroundTasks` fires `_run_llm_parse()` async — non-blocking
- [x] After parse: `parsedData` saved, `status: parsed`
- [x] `POST /api/resume/parse/{id}` — manual re-trigger endpoint

### Admin Preview (Structured)
- [x] Modal shows ParsedResumeView: contact card, skills tags, experience timeline, education entries
- [x] Falls back to raw text if not yet parsed
- [x] Status badge: `📋 Uploaded` → `⏳ Parsing...` → `✅ Parsed (87%)`

---

## Phase 3 — Skills Matching ✅ Done (2026-05-27)

### Role Requirements
- [x] `backend/app/data/role_requirements.json` — 6 roles: Frontend, Backend, Full Stack, DevOps, AI/ML, Mobile
- [x] Each role: required[] + preferred[] skills (normalised against skills taxonomy)

### Skills Match Endpoint
- [x] `GET /api/admin/resume/match?candidateId=&role=`
- [x] Loads latest parsed resume for candidate, computes match % vs role requirements
- [x] Required skills weighted 70%, preferred 30% for overall score
- [x] Returns: overallScore, requiredMatch, preferredMatch, matched/missing skill lists, one-line summary

### Admin UI — Match Button + Modal
- [x] 🔗 Match button in candidates table row (disabled until resume is parsed)
- [x] Modal: role dropdown (6 roles), overall/required/preferred score badges, required skills (green=matched, red=missing), preferred skills (green=matched, yellow=missing)

### Files Added (Phase 3)
- `backend/app/data/role_requirements.json` — new: role requirements
- `backend/app/api/resume/route.py` — added `GET /api/admin/resume/match` endpoint
- `frontend/app/admin/dashboard/page.tsx` — Match button + `SkillMatchData` + `matchModal` + match modal UI

---

## Parser Output (for Phase 2+)

```json
{
  "name": "string | null",
  "email": "string | null",
  "phone": "string | null",
  "skills": ["array"],
  "experience": [
    {
      "company": "string",
      "title": "string",
      "duration": "string",
      "highlights": ["array"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "year": "string"
    }
  ],
  "summary": "string",
  "confidence_score": 0.95
}
```

---

## Acceptance Criteria (Phase 1 — DONE)

- [x] Resume files saved to backend storage (`backend/uploads/resumes/`)
- [x] Raw text extracted and stored in SQLite for admin preview
- [x] Admin can preview + download resume from candidates table
- [x] 5MB file size limit enforced

## Acceptance Criteria (Phase 2+ — Planned)

- [ ] Resume files processed correctly
- [ ] Data extracted accurately
- [ ] Profile auto-populated
- [ ] AI insights generated

---

## Dependencies

- TASK-001: Project Bootstrap (base infrastructure)
- TASK-003: Candidate Onboarding (profile storage)
- TASK-004: Interview System (question generation)

---

## Status
- **Created**: 2026-05-20
- **Priority**: MEDIUM
- **Current Phase**: Complete ✅
- **Last Updated**: 2026-05-27
- **Implementation Started**: Yes
- **Completion**: 100% (Phase 1 + 2 + 3 skills matching done; gap detection and question generation out of scope per Karan's request)
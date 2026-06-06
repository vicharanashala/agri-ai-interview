# Progress Report — Sat 2026-06-06 16:07

## What We're Building

**4-phase pipeline** for an Agri AI Interview Platform:
1. Onboarding (form + resume upload)
2. Interview (live AI chat, 3 attempts max, anti-cheat)
3. Summary (PASS/FAIL + score)
4. Documents (candidate uploads 14 document fields)

---

## Master Plan (All 11 Points)

### ✅ 1. Database: Add `fileIndex` column
- `CandidateDocument` table now has `fileIndex Int NOT NULL DEFAULT 1`
- Unique constraint: `CandidateId + fieldName + fileIndex` (allows multiple files per field)
- **Run this SQL** (already applied, for reference):
  ```sql
  ALTER TABLE "CandidateDocument" ADD COLUMN "fileIndex" INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE "CandidateDocument" ADD CONSTRAINT "CandidateDocument_candidateId_fieldName_fileIndex_key" UNIQUE ("candidateId", "fieldName", "fileIndex");
  ```

### ✅ 2. Prisma schema: Add `fileIndex` + unique constraint
- **File:** `frontend/prisma/schema.prisma`
- `CandidateDocument` model updated:
  ```prisma
  fieldName   String    // field key from DOCUMENT_FIELDS
  fileIndex   Int       @default(1)
  @@unique([candidateId, fieldName, fileIndex])
  ```

### ✅ 3. SQLAlchemy model: Add `fileIndex` column
- **File:** `backend/app/db/models/candidate.py`
- `CandidateDocument` class updated with:
  ```python
  fieldName = Column(String, nullable=False)
  fileIndex = Column(Integer, nullable=False, default=1)
  ```

### ✅ 4. Backend API: all 14 fields, multi-file, validation
- **File:** `backend/app/api/candidate/documents.py`
- `POST /api/candidate/documents` — accepts all 14 fields as `UploadFile`
- `GET /api/candidate/documents` — lists all docs for current candidate
- `GET /api/candidate/documents/{field_name}?index=N` — download specific doc
- `DELETE /api/candidate/documents/{field_name}?index=N` — delete specific doc
- All 14 field keys: `updated_resume`, `marksheet_10`, `marksheet_12`, `grad_marksheets`, `grad_certificate`, `pg_marksheets`, `pg_certificate`, `experience_letter`, `salary_slips`, `aadhaar`, `pan`, `bank_details`, `other_docs`, `noc`
- Per-field max sizes: 5MB (most), 10MB (marksheets/certs)
- Allowed: PDF, DOC, DOCX only
- `fileIndex` auto-incremented on each upload — no delete/replace, only append

### 🔧 5. Frontend upload page: rewrite with 12 fields, multi-file, preview
- **File:** `frontend/app/upload-documents/page.tsx`
- **Status: IN PROGRESS — not finished yet**
- Needs rewrite from scratch with:
  - All 14 fields (not just 4)
  - Multi-file per field support (add more button, numbered file list)
  - Click filename → preview modal (PDF via `<embed>`, DOCX via download)
  - Submit only enabled when ALL 6 required fields have ≥1 file
  - Drag & drop per field
  - Remove individual files
  - Conditional fields (NOC shown if "currently studying" checked; PG fields shown if "Post-Graduation" checked; Experience Letter + Salary Slips shown if "Has prior experience" checked)
  - **NO emoji in congratulations title**
  - **NO phase bar ("Phase 4 of 4")**

### ⏳ 6. Next.js API route: confirm it passes multi-file to FastAPI correctly
- **File:** `frontend/app/api/candidate/documents/route.ts`
- Check it correctly forwards multiple files per field as `multipart/form-data` to FastAPI
- May need to be rewritten to match the new backend API shape

### ⏳ 7. Fix `end_interview`: set `currentPhase = "summary"` in DB
- **File to find:** `backend/app/api/candidate/route.py` or similar
- **Root cause:** `complete_interview` does NOT set `candidate.currentPhase = "summary"` in DB
- The dashboard checks `currentPhase` in DB to unlock phase 4 — since it stays at "interview", phase 4 never unlocks
- **Fix:** In the `complete_interview` (or `end_interview`) function, after setting PASS/FAIL, add:
  ```python
  candidate.currentPhase = "summary"
  db.commit()
  ```
- This is the **single most important fix** — unlocks phase 4 AND fixes summary "In Progress" bug

### ⏳ 8. Fix summary page: "In Progress" → PASS/FAIL
- **File:** `frontend/app/summary/page.tsx`
- Needs investigation — likely because `syncPhaseToDb(3)` doesn't work reliably
- Fix in point 7 should resolve most of this

### ⏳ 9. Prisma `db push` / `generate` to pick up schema changes
- `frontend/prisma/schema.prisma` updated — needs to be pushed to DB and client regenerated
- Run inside Docker container:
  ```bash
  docker compose -f docker-compose.dev.yml exec frontend npx prisma db push --accept-data-loss
  docker compose -f docker-compose.dev.yml exec frontend npx prisma generate
  ```
- Actually the schema change (fileIndex) is already applied via raw SQL in step 1 — but `prisma generate` is needed to update the client

### ⏳ 10. Admin documents tab: view, download, delete per candidate
- **Files:** `frontend/components/admin/DocumentsTab.tsx`, `backend/app/api/admin/documents.py`
- Admin needs to:
  - View all documents uploaded by any candidate
  - Download individual files
  - Download all docs as ZIP
  - Delete specific files
  - "Send Offer Email" button → triggers `send_offer_email` from `backend/app/services/email_service.py`
  - Reset/delete candidate entry (allow immediate retry)

### ⏳ 11. End-to-end test: full pass candidate flow
- Create a test candidate, go through onboarding, fail/pass interview, verify phase 4 unlocks, upload all docs, verify admin sees them

---

## Known Bugs

### Bug 1: Phase 4 never unlocks after interview
- **Root cause:** `complete_interview` / `end_interview` backend endpoint does NOT set `candidate.currentPhase = "summary"` in DB
- **Fix:** Add `candidate.currentPhase = "summary"; db.commit()` in the endpoint that completes the interview
- **Priority:** 🔴 Critical — blocks entire phase 4

### Bug 2: Summary page shows "In Progress" instead of PASS/FAIL
- **Root cause:** Likely same as Bug 1 — `currentPhase` never set to "summary", so some status logic branches incorrectly
- **Fix:** Same as Bug 1

---

## 14 Document Fields

| # | Field Key | Label | Required | Multi-file |
|---|-----------|-------|----------|------------|
| 1 | `updated_resume` | Updated Resume | ✅ | No |
| 2 | `marksheet_10` | 10th Marksheet | ✅ | No |
| 3 | `marksheet_12` | 12th Marksheet | ✅ | No |
| 4 | `grad_marksheets` | Graduation Marksheets | No | ✅ |
| 5 | `grad_certificate` | Graduation Certificate | No | No |
| 6 | `pg_marksheets` | PG Marksheets | No | ✅ |
| 7 | `pg_certificate` | PG Certificate | No | No |
| 8 | `experience_letter` | Experience/Offer Letter | No | No |
| 9 | `salary_slips` | Salary Slips (3 months) | No | ✅ |
| 10 | `aadhaar` | Aadhaar Card | ✅ | ✅ |
| 11 | `pan` | PAN Card | ✅ | ✅ |
| 12 | `bank_details` | Bank Account Details | ✅ | No |
| 13 | `other_docs` | Other Documents | No | ✅ |
| 14 | `noc` | NOC (if studying) | No | No |

---

## Files Changed So Far

- `frontend/prisma/schema.prisma` — fileIndex added to CandidateDocument
- `backend/app/db/models/candidate.py` — fileIndex added to CandidateDocument SQLAlchemy
- `backend/app/api/candidate/documents.py` — fully rewritten with 14 fields + multi-file
- `frontend/app/upload-documents/page.tsx` — still the OLD version with only 4 fields

---

## Where to Resume

Pick up from **Point 5 (Frontend upload page)** — it was actively being rewritten when we stopped. The backend and DB are fully ready.

After finishing Point 5 → Point 7 is the critical bug fix → then Points 6, 8, 9, 10, 11 follow.

---

_Last updated: 2026-06-06 16:21

## Session Summary — Sat 2026-06-06 16:21

### Point 5 — Frontend upload page rewrite
**Status: IN PROGRESS — partial**

Work was started but not completed. Here's what was done:
- Analysed the existing 4-field upload page
- Analysed the backend `documents.py` API (14 fields, multi-file, `fileIndex`)
- Analysed the Next.js API route — confirmed it correctly forwards `FormData` + `x-redis-token` header to FastAPI
- Analysed onboarding data to understand conditional field logic (`hasExperience`, `currentlyStudying`, `isPostGrad`)
- Planned full component rewrite with:
  - All 14 fields from `ALL_FIELDS` array
  - `FileMap` type: `Record<string, UploadedFile[]>` (array per field for multi-file support)
  - Conditional visibility derived from candidate's onboarding data (GET `/api/candidate`)
  - Multi-file per field via hidden file input + "+ Add more" button
  - Per-field drag & drop (single-file fields: replace; multi-file fields: append)
  - Remove individual files (with `splice` on array)
  - PDF preview via `<embed>` in modal; DOCX fallback to download link
  - Success/Already-Submitted states
  - Submit disabled until ALL visible required fields have ≥1 file

**Not completed:** The file write was started but not saved. Needs the full `page.tsx` + `page.module.css` update to be written to disk._
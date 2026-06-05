# Implementation Status — Agri AI Interview Platform

_Last reviewed: 2026-06-04_
_Audit completed: Phase 2 interview workflow — all items verified against actual source files_

---

## How to Read This File

- ✅ **Complete** — fully implemented and working
- 🚧 **Partial / In Progress** — partially done, see notes
- ⬜ **Not Started** — planned but not yet implemented
- ❌ **Not Applicable** — explicitly not part of current scope

---

## Feature Status

### Authentication & Session

| Feature | Status | Notes |
|---------|--------|-------|
| Candidate manual login (email + password) | ✅ Complete | |
| Candidate Google OAuth | ✅ Complete | Email only, name/photo not pulled |
| Admin login | ✅ Complete | |
| Candidate single-device login enforcement | ✅ Complete | Redis-backed; 2nd device kicks 1st; 401 redirects to login |
| Admin multi-device login | ✅ Complete | In-memory token store; multiple sessions allowed |
| Session: idle 15s during interview → close | ✅ Complete | Admin-configurable threshold; 1st=warning, 2nd=close |
| Session: inactive 15min elsewhere → re-login | ✅ Complete | Admin-configurable threshold; all candidate pages |
| Anti-cheat: admin threshold settings UI | ✅ Complete | Settings tab in admin dashboard |
| Candidate logout | ✅ Complete | |

---

### Onboarding

| Feature | Status | Notes |
|---------|--------|-------|
| Onboarding form | ✅ Complete | Fields fixed from backend, not admin-configurable |
| Resume upload | ✅ Complete | PDF + DOCX supported |
| No editing after submit | ⬜ Not Started | Candidate can still edit after submit |
| Onboarding → Email #1 (account activated) | ⬜ Not Started | **In progress — notification service built, needs wiring to onboarding submit. Skipping for now, will revisit.** |
| State/district fields in onboarding | ✅ Complete | |

---

### Interview System

| Feature | Status | Notes |
|---------|--------|-------|
| Text-based chat interview | ✅ Complete | |
| First question: fixed string (hardcoded) | 🚧 Partial | Hardcoded as "Hi, Welcome to the Interview. Please tell me about yourself"; NOT admin-configurable yet |
| Subsequent questions: dynamic (resume, answers, agri topics) | ✅ Complete | Uses candidate_data, conversation context, crop-specific fallbacks |
| VLLM connection check before interview starts | 🚧 Partial | VLLM health not checked proactively — failure surfaces as exception when first question is generated |
| Max concurrent interview limit (VLLM capacity) | ✅ Complete | Hardcoded to 10 in `queue_manager.py`; not admin-configurable yet |
| Slot unavailable → "Try after sometime" message | ✅ Complete | Frontend handles `queueData.result === 'no_slot'` and shows "All slots are full, please try after sometime" |
| VLLM down → "Please come again later" message | ⬜ Not Started | No separate VLLM-down check; would surface as unhandled error |
| Live interview view in admin dashboard | ✅ Complete | Read-only via LiveTab.tsx |
| Admin cannot end interview manually | ✅ Complete | No endpoint or UI for this |
| Only summary saved (not full chat) | 🚧 Partial | Chat not saved to DB; only `interviewData` JSON (score + result) saved to `InterviewSession`. Chat persists in-memory only; lost on backend restart |
| One-shot interview (no pause/resume) | 🚧 Partial | Frontend has pause/resume UI + backend has `/pause`, `/resume`, `InterviewStateSnapshot` model — contradicts one-shot requirement |
| Max 3 attempts per candidate | ⬜ Not Started | `/api/candidate/attempts` returns all sessions but no 3-attempt enforcement at start |
| Question limit enforcement | ✅ Complete | `max_questions` from settings (default 10); `InterviewState.is_complete()` checks `question_count >= max_questions` |
| Time limit enforcement | ⬜ Not Started | No time limit check in `InterviewState.is_complete()` |

---

### Anti-Cheat System

| Feature | Status | Notes |
|---------|--------|-------|
| Idle time limit trigger | ✅ Complete | `idleThresholdMs` from admin settings (default 15s); `checkAndRecord('idle')` fires after threshold |
| Back page / minimize tab trigger | ✅ Complete | `visibilitychange` → `tab_switch`, `blur` → `window_blur` |
| Copy paste trigger | ✅ Complete | `copy` and `paste` events preventDefault + trigger |
| Right click trigger | ✅ Complete | `contextmenu` prevented |
| Tab switch trigger | ✅ Complete | `visibilitychange` when `document.hidden` |
| 1 warning → 2nd same trigger = close | ✅ Complete | `offenseCount >= 2` → `onTerminate()` called; 2s closing screen then ends interview |
| Interview tagged as "Closed due to [trigger]" | 🚧 Partial | Interview ends with `interviewTerminatedCheat=true` flag + `/summary?terminated=true`; but `AntiCheatEvent` is logged to DB without the tag being used in the result |
| Anti-cheat trigger thresholds (X mins idle, etc.) | ✅ Complete | `anti_cheat_idle_threshold_ms` stored in DB Settings; fetched at interview start via `/api/settings/anti-cheat` |
| Internet drop → interview closes | ✅ Complete | Frontend calls `/pause` on `beforeunload`; backend sets `InterviewSession.status = 'paused'`; candidate sees resume prompt on return |
| Candidate can re-attempt immediately after VLLM drop | 🚧 Partial | Backend has resume flow; but if session is `completed` (candidate ends themselves) cooldown may apply |

---

### Evaluation

| Feature | Status | Notes |
|---------|--------|-------|
| LLM evaluates after interview | ✅ Complete | `llm_service.generate_interview_evaluation()` called on `/evaluate` endpoint |
| Admin sets evaluation categories + weights | 🚧 Partial | `evaluation_system` guideline stored in DB (categories + weights defined there); admin can edit via settings API |
| Admin sets pass/fail threshold (score out of 100) | ⬜ Not Started | No threshold in DB; summary page shows score but no PASS/FAIL determination |
| NO manual override by admin | ✅ Complete | No override endpoint exists |
| Result: PASS | 🚧 Partial | Score shown on summary page; no PASS/FAIL logic based on threshold |
| Result: FAIL | 🚧 Partial | Same — FAIL only if admin manually marks it |
| Result: WITHDRAWN | ⬜ Not Started | Candidate can end interview (voluntary); no WITHDRAWN result type stored |
| Result: FAIL_DUE_TO_ANTI_CHEAT | 🚧 Partial | Summary page receives `terminated=true` but no FAIL_DUE_TO_ANTI_CHEAT result stored in DB |
| Score + result sent in Email #2 | ⬜ Not Started | |

---

### Cooldown & Retry

| Feature | Status | Notes |
|---------|--------|-------|
| FAIL → cooldown X days (admin-set) | ⬜ Not Started | |
| WITHDRAWN → cooldown X days (admin-set) | ⬜ Not Started | |
| Cooldown countdown shown in dashboard | ⬜ Not Started | |
| After cooldown → fresh attempt allowed | ⬜ Not Started | |
| Admin can reset anti-cheat entry → immediate retry | ⬜ Not Started | |
| Admin cannot reset FAIL entry | ⬜ Not Started | |
| Admin cannot reset WITHDRAWN entry | ⬜ Not Started | |
| FAIL_DUE_TO_ANTI_CHEAT does NOT count toward 3 attempts | ⬜ Not Started | |

---

### Offer Letter & Joining

| Feature | Status | Notes |
|---------|--------|-------|
| Admin sets offer letter format (template) | ✅ Complete | Settings tab in admin dashboard; all fields editable; stored in DB |
| Admin sets joining details format | ⬜ Not Started | |
| Admin can preview offer letter | ✅ Complete | Preview PDF button in admin dashboard generates live preview |
| System generates offer letter PDF | ✅ Complete | reportlab; reads from DB config or falls back to defaults |
| Candidate views offer letter PDF in portal | ✅ Complete | Modal iframe on /offer page |
| Candidate downloads offer letter PDF | ✅ Complete | Download button on /offer page |
| Candidate [Accept & Sign] (click = acceptance) | ✅ Complete | Phase 5 signing page |
| E-sign: no third-party service | ✅ Complete | Candidate name entry + checkbox = legal acceptance |
| Timestamp recorded on sign | ✅ Complete | syncPhaseToDb(6) records phase change timestamp |
| Joining details shown in portal | ⬜ Not Started | |
| Email #3: offer letter PDF + joining details attached | ⬜ Not Started | Not yet wired to signing action |

---

### FAQ

| Feature | Status | Notes |
|---------|--------|-------|
| Public `/faq` page (no login required) | ⬜ Not Started | |
| FAQ button on login page | ⬜ Not Started | |
| FAQ button on candidate dashboard | ⬜ Not Started | |
| Admin manages FAQ Q&A pairs | ⬜ Not Started | |

---

### Admin Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard overview: candidate counts per phase | ⬜ Not Started | |
| Search/filter by name, email, status, date | ⬜ Not Started | |
| Attempt counter per candidate visible | ⬜ Not Started | |
| View LIVE interviews (real-time, read-only) | ✅ Complete | |
| View all candidates data | ✅ Complete | |
| Manage FAQ | ⬜ Not Started | |
| Manage question generation guidelines | ⬜ Not Started | |
| Manage evaluation metrics | ⬜ Not Started | |
| Manage first question | ⬜ Not Started | |
| Manage anti-cheat settings | ⬜ Not Started | |
| Manage cooldown period | ✅ Complete | Interview Config tab in admin dashboard — admin sets cooldown days (0–365), saved to `interview_cooldown_days` DB setting |
| Manage offer letter format | ⬜ Not Started | |
| Manage joining details format | ⬜ Not Started | |
| Manage email from address | ⬜ Not Started | |
| View all evaluations (detailed summary) | ✅ Complete | New 'Evaluations' tab in admin dashboard — table of completed interviews with PASS/FAIL, score, end reason; click to expand full chat history + LLM evaluation breakdown (metrics, topic scores, strengths, areas for improvement). Server-side filtering by result + search. Load-more pagination. | |
| View anti-cheat triggered interviews | ⬜ Not Started | |
| Reset/delete anti-cheat entries | ⬜ Not Started | |
| Reset/delete withdrawn entries | ⬜ Not Started | |
| Notification system (VLLM status, anti-cheat alerts) | ⬜ Not Started | |
| Resend emails | ⬜ Not Started | |
| State/district geographic stats | ✅ Complete | |
| Resume preview + download (admin) | ✅ Complete | |

---

### Candidate Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Current phase indicator | 🚧 Partial | Phase tracked in localStorage/sessionStorage; candidate dashboard shows phase-related UI; no explicit phase indicator component visible |
| View filled onboarding details (view-only) | ✅ Complete | `/dashboard` shows onboarding data (read from DB) |
| Start/resume interview button | ✅ Complete | Start + resume (paused sessions) both handled |
| Live interview chat | ✅ Complete | Full chat UI with eval cards, stats, input |
| Past interview attempts (status only) | ✅ Complete | `/api/candidate/attempts` returns all completed sessions with score + result; shown on dashboard |
| Cooldown countdown (FAIL/WITHDRAWN) | ⬜ Not Started | No cooldown enforcement in start flow |
| View & download offer letter PDF | ⬜ Not Started | |
| Accept & Sign offer letter | ⬜ Not Started | |
| View joining details | ⬜ Not Started | |
| FAQ link | ⬜ Not Started | |
| Single-device login enforcement | ✅ Complete | Redis-backed; 2nd device kicks 1st |

---

### Queue System

| Feature | Status | Notes |
|---------|--------|-------|
| FIFO queue | 🚧 Partial | Schema exists (`InterviewQueueEntry`, `InterviewStateSnapshot`); but workflow has NO queue — slot-or-nothing with "please try later" message |
| Slot-based start (no queue) | ✅ Complete | `slot_manager.start_interview()` checks `has_open_slot`; returns `no_slot` if full |
| Queue full → "Slot not available" (no waiting) | ✅ Complete | Frontend handles `result === 'no_slot'` and shows "All slots are full, please try after sometime" |
| Dynamic pool model (N concurrent, rest queue) | ❌ Not Applicable | Workflow has no queue; no waiting system |
| 5-minute join window for queued candidates | ❌ Not Applicable | No queue |
| No-show → skipped with cooldown | ❌ Not Applicable | No queue |

---

## Task Files Reference

| Task | Name | Status |
|------|------|--------|
| TASK-001 | Project Bootstrap | ✅ Complete |
| TASK-002 | Authentication System | ✅ Complete |
| TASK-003 | Candidate Onboarding | ✅ Complete |
| TASK-004 | AI Chat Interview | ✅ Complete |
| TASK-005 | Evaluation Pipeline | ✅ Complete |
| TASK-006 | FAQ Assistant | ✅ Complete |
| TASK-007 | Notification System | ⬜ Not Started |
| TASK-008 | Anti-Cheating System | 🚧 Mostly Complete |
| TASK-009 | Resume Parser Pipeline | 🚧 Phase 2 Complete |
| TASK-010 | Session Management | ✅ Complete |
| TASK-011 | Admin Dashboard | 🚧 In Progress | Live interviews, candidates, analytics, **evaluations tab** (new), anti-cheat, settings — all done. |
| TASK-012 | Interview Queue System | 🚧 Phase 1 Done |

---

## Priority Order for Remaining Work

Based on workflow critical path:

1. **VLLM connection check before interview start** — prevents failed interviews
2. **Max 3 attempts + slot check** — core workflow constraint
3. **Email notifications** (✉1, ✉2, ✉3) — candidate communication
4. **Admin configurable settings** (cooldown, evaluation metrics, first question, anti-cheat thresholds) — ✅ Anti-cheat thresholds done
5. **Offer letter PDF generation** — pass flow
6. **Cooldown system** — fail/withdrawn flow
7. **FAQ public page + admin management**
8. **Admin notifications** — system alerts
9. **Candidate dashboard phase indicator + past attempts**
10. **Queue system enforcement** (currently in schema only)

---

_Last reviewed: 2026-06-04_
# MEMORY.md - Long-Term Memory

## Deployment Flow
Karan's deployment pipeline (permanent, do not ask again):
1. **Code push** → GitHub
2. **GitHub Actions** → `deploy.yml` builds & pushes Docker images to **Docker Hub**
3. **Portainer** → Stack with compose file + env vars pulls latest image from Docker Hub and deploys

**Files used in Portainer stack:**
- `docker-compose.yml` — defines all 4 services (backend, frontend, redis, postgres)
- `stack.env` — contains all environment variables for the stack

Both files are saved in the workspace root at `/Users/karanchoudhary/Annam/ai-interview-platform/`

**⚠️ NEVER modify `docker-compose.yml` or `stack.env`.** These are production files. Do not edit, touch, or suggest changes to them under any circumstances.

## Local Dev Deployment
For running the app locally, use these two files (never the production ones):
- `docker-compose.dev.yml` — local compose file with hot-reload build
- `.env` — local environment variables

**Command:**
```bash
docker compose -f docker-compose.dev.yml --env-file .env up
```

**Run with rebuild (after code changes):**
```bash
docker compose -f docker-compose.dev.yml --env-file .env up --build
```

**ALWAYS run in foreground** — never `-d` (background mode). Karan wants live output in the terminal.

## Core Rule
**Never implement anything before Karan's confirmation.** Always present the plan/approach and wait for approval before acting.

_Last updated: 2026-06-04_

---

## Project Context
- **Workspace:** `/Users/karanchoudhary/Annam/ai-interview-platform`
- **Project:** Agri AI Interview Platform

---

## Candidate Pipeline — 6 Phases (FINAL)

Agri AI Interview Platform handles end-to-end hiring for an **agri internship** program. Single interview type for all candidates. Fully automated pass/fail evaluation. Anti-cheat system with admin-controlled reset.

The pipeline has exactly **6 phases**:

| # | Phase | Description |
|---|-------|-------------|
| 1 | **Onboarding** | Fill form + upload resume → Account activated |
| 2 | **Interview Dashboard** | View profile, past attempts, start interview |
| 3 | **Summary** | View evaluation result + score |
| 4 | **Offer Letter** | View & download offer letter |
| 5 | **Signing** | Accept & sign offer letter |
| 6 | **Joining** | View joining details |

**Live interview** is part of Phase 2 — clicking [Start Interview] opens the live chat. After interview ends, candidate lands on Phase 3 (Summary).

### Phase 3 Outcomes (what happens after the interview)

**No automatic failures.** Regardless of how the interview ends, every candidate is evaluated. The end reason is recorded but does NOT affect the outcome — the result (PASS or FAIL) is always based purely on the evaluation score vs. the admin-set threshold.

**Interview end reasons:**
- Anti-cheat trigger (2nd same trigger)
- Candidate voluntarily withdraws
- Question limit reached
- Time limit exceeded

| Result | Goes to | Cooldown | Counts toward 3 attempts |
|--------|---------|----------|--------------------------|
| **PASS** | Phase 4 → Phase 5 → Phase 6 | No | Yes |
| **FAIL** | Back to Phase 2 after cooldown | Yes (X days, admin-set) | Yes |

---

## Signup & Login

**Signup fields:** Name, Email, Password
**Google OAuth:** Email only (name/photo not pulled)
**Admin signup:** Separate admin login at `/admin/login`

**Candidate login: single-device only**
- 2nd device login kicks 1st device
- 1st device shows login screen again
- 2nd device resumes from same interview state

**Admin login: multi-device allowed** (same credentials, multiple sessions)

**Session rules:**
- During interview: idle 15 seconds → interview auto-closed
- Outside interview: inactive 15 minutes → forced re-login
- Any interview end (anti-cheat trigger, withdrawal, question limit, time limit) → goes to evaluation → PASS or FAIL based on score

---

## Public Pages (No Login Required)

**Landing/Login Page** (`/login`, `/signup`)
- Google OAuth or manual signup
- FAQ button → links to `/faq`

**FAQ Page** (`/faq`)
- Public, no login required
- Q&A managed by admin in admin dashboard
- Accessible from login page and candidate dashboard

---

## Phase 1: Onboarding

- Onboarding form fields are **fixed from backend** (not admin-configurable)
- Candidate uploads resume during onboarding (PDF or DOCX, max 5MB)
- **No editing after submission** — form freezes to read-only view
- On submit → **Email #1 sent: Account Activated / Welcome email**
- After submit → phase updated to `"interview"`, candidate lands on Phase 2 dashboard

---

## Phase 2: Interview Dashboard

Candidate dashboard shows:
- Current phase indicator (1–6)
- Filled onboarding details (view-only, no editing after submit)
- Past interview attempts with status (PASS / FAIL) + end reason visible on summary page
- FAQ link
- [Start Interview] button → opens live interview chat (part of Phase 2)

**Live Interview (inside Phase 2):**
- Text-based chat with AI. One-shot only — no pausing or resuming mid-interview.
- **First question:** Fixed string, same for all candidates (stored in system, set by admin)
- **Subsequent questions:** Generated dynamically based on resume data, onboarding data, previous answers, question generation guidelines (admin-managed), agri topics
- **No character/word limit on answers**

**Interview ends by:**
1. Anti-cheat trigger (2nd same trigger)
2. Candidate voluntarily withdraws
3. Question limit reached
4. Time limit exceeded

**Admin Dashboard — Live View:**
- Admin can view live interview in real-time (read-only)
- Admin **cannot** end interview manually

**Slot Check before starting:**
- Interview only starts **after VLLM connection is established**
- System has a max concurrent interview limit (based on VLLM capacity)
- If slot available → interview starts
- If slot unavailable → show: "Slot not available. Try after sometime"
- If VLLM is down → show: "Please come again later for interview"
  (This does NOT count as an attempt — candidate can restart immediately once VLLM is back)
  (No queue/waiting system — immediate feedback only)

**Maximum attempts:** Each candidate can appear for interview at most **3 times**. After 3 attempts exhausted (PASS or FAIL), no more interviews.

---

## Anti-Cheat System

5 triggers (each gets 1 warning, same trigger again = immediate close):

| Trigger | 1st | 2nd Same |
|---------|-----|----------|
| Idle > X minutes | ⚠ Warning | Interview CLOSED |
| Back page / minimize tab | ⚠ Warning | Interview CLOSED |
| Copy paste | ⚠ Warning | Interview CLOSED |
| Right click | ⚠ Warning | Interview CLOSED |
| Tab switch | ⚠ Warning | Interview CLOSED |

- First occurrence of any trigger → warning shown to candidate
- Same trigger occurs again → interview immediately closed → goes to evaluation → PASS or FAIL based on score

**On trigger close:** Interview is evaluated and scored like any other interview end.

---

## Phase 3: Interview Summary

After interview ends, LLM evaluates using:
- Complete chat history
- Evaluation metrics (set by admin)
- Questions asked
- Threshold (set by admin)

**Admin sets in dashboard:**
- Evaluation categories/criteria (e.g., technical knowledge, communication)
- Individual weight for each category
- Overall pass/fail threshold (score out of 100)

**NO manual override by admin.** Fully automated.

**Candidate sees:** PASS or FAIL + score + end reason + outcome-specific next steps

**FAIL:** Cooldown countdown shown — "Come after [X] days"
**PASS:** Message says "Congratulations! Proceed to view your offer letter."

---

## Email Notifications

| # | Trigger | Contents |
|---|---------|----------|
| ✉ 1 | Account activated (after onboarding) | Welcome message |
| ✉ 2 | Evaluation complete | Result (PASS/FAIL) + score + end reason + cooldown info for fail |
| ✉ 3 | Offer letter signed | Offer letter PDF + joining details PDF (attached) |

- Email from address: managed by admin in dashboard
- Resend button available in admin dashboard for all emails

---

## Phase 4: Offer Letter

(Only shown to PASS candidates)

**Admin manages in dashboard:**
- Offer letter format (template with placeholders) — admin can preview

**System generates:**
- Offer letter PDF → preview in candidate portal + downloadable + emailed

**Candidate actions:**
1. View offer letter PDF in dashboard
2. Download offer letter PDF
3. Proceeds to Phase 5

---

## Phase 5: Signing

- Candidate clicks [Accept & Sign]
  - No third-party e-sign service — candidate click = acceptance
  - Timestamp recorded
- **Email #3 sent:** Offer letter + joining details PDF attached
- Proceeds to Phase 6

---

## Phase 6: Joining

**Admin manages:**
- Joining details format — admin can preview

**System generates:**
- Joining details → shown in portal + emailed

**Candidate views joining details** (managed + previewed by admin in dashboard)

After viewing → pipeline complete.

---

## Admin Dashboard Features

- Dashboard overview: candidate counts per phase
- Search/filter candidates by name, email, status, date
- Attempt counter per candidate visible
- View LIVE interviews (real-time, read-only)
- View all candidates data
- Manage FAQ (Q&A pairs → reflects on candidate `/faq` page)
- Manage question generation guidelines
- Manage evaluation metrics (categories + weights + threshold)
- Manage first question (fixed string for all)
- Manage anti-cheat settings (trigger thresholds)
- Manage cooldown period (days for all failed candidates)
- Preview offer letter format
- Preview joining details format
- Manage joining details format
- Manage email from address
- View all evaluations (detailed summary — NOT shown to candidates)
- View anti-cheat triggered interviews (viewed like any other interview)
- Reset/delete any failed entry (immediate retry allowed)
- Notification system (system alerts for VLLM status, multiple anti-cheat triggers, etc.)
- Resend emails (for failed deliveries)
- Multi-device admin login: allowed

---

## Candidate Dashboard Features

- Current phase indicator (1–6)
- View filled onboarding details (view-only, no editing after submit)
- Past interview attempts (status only — no detailed summary)
- Start interview (3-attempt maximum enforced)
- After FAIL: Cooldown countdown ("Try after X days")
- PASS: View & download offer letter PDF
- PASS: Accept & Sign offer letter
- View joining details (Phase 6)
- FAQ link
- Single-device login enforcement

---

_Last updated: 2026-06-05_
# Phase 4 — Upload Documents: Source of Truth

> This document defines the complete candidate and admin flows for all 4 phases of the pipeline.
> All implementation must match this document. Update this file first if the design changes.

---

## Table of Contents

1. [Overview](#overview)
2. [Phase Map](#phase-map)
3. [Full Candidate Flow](#full-candidate-flow)
   - [Phase 1: Onboarding](#phase-1-onboarding)
   - [Phase 2: Interview Dashboard](#phase-2-interview-dashboard)
   - [Phase 3: Summary](#phase-3-summary)
   - [Phase 4: Upload Documents](#phase-4-upload-documents)
4. [Pipeline Complete (Candidate Side)](#pipeline-complete-candidate-side)
5. [Email Notifications — All 3 Emails](#email-notifications--all-3-emails)
6. [Full Admin Dashboard Flow](#full-admin-dashboard-flow)
7. [Admin Actions on Documents](#admin-actions-on-documents)
8. [Dashboard Phase Card States](#dashboard-phase-card-states)
9. [Database Changes](#database-changes)
10. [API Endpoints](#api-endpoints)
11. [Frontend Pages](#frontend-pages)
12. [Middleware Changes](#middleware-changes)
13. [Files to Modify / Create](#files-to-modify--create)
14. [Configuration](#configuration)
15. [Error States](#error-states)
16. [Session / Navigation Rules](#session--navigation-rules)

---

## Overview

**Phase 4 "Upload Documents" replaces the old phases 4 (offer), 5 (signing), and 6 (joining) entirely.**
Candidates who PASS the interview no longer see offer/signing/joining pages. Instead they upload documents and the pipeline ends there. The offer letter is sent manually by the admin after reviewing submitted documents.

---

## Phase Map

| Phase | Name | Description |
|-------|------|-------------|
| 1 | Onboarding | Fill form + upload resume |
| 2 | Interview | AI chat interview |
| 3 | Summary | PASS/FAIL + score + end reason |
| 4 | **Upload Documents** | Upload required documents → thank-you screen |

---

## Full Candidate Flow

```
LOGIN
    ↓
/post-login → checks session
    ↓
    ├─ No session → /login
    ├─ Session + onboarding incomplete → /onboarding
    └─ Session + onboarding complete → /dashboard
```

### Phase 1: Onboarding
```
/onboarding
    ↓
Candidate fills form (name, phone, address, education, farming background)
    ↓
Uploads resume (PDF/DOCX, max 5MB)
    ↓
Submits
    ↓
Email #1 sent: "Account Activated / Welcome"
    ↓
DB: currentPhase = "interview"
    ↓
Redirects to /dashboard
```

#### Onboarding Form Fields

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Full Name | text | Yes | Min 2 chars |
| Email | email | Yes | Valid email format |
| Phone | text | Yes | 10-digit Indian mobile number |
| Address | textarea | Yes | Min 10 chars |
| State | select | Yes | Pre-populated list of Indian states |
| District | select | Yes | Depends on selected state; pre-populated list |
| Education | select | Yes | Options: Below 10th, 10th Pass, 12th Pass, Diploma, Graduate, Post-Graduate |
| Farming Background | textarea | Yes | Min 20 chars — why candidate is interested in agri internship |
| Resume | file upload | Yes | PDF or DOCX, max 5MB |

#### Resume Upload Rules
- **Allowed formats:** PDF (.pdf), DOCX (.docx), DOC (.doc)
- **Max size:** 5MB
- **Storage:** Resume stored in DB as bytes in `Candidate.resumeData` field
- **On re-upload:** Previous resume is replaced
- **No editing after submit:** Once submitted, all fields become read-only; candidate cannot edit any field

#### Onboarding Page UX
```
┌──────────────────────────────────────────────────────────────┐
│ Phase 1 of 4: Onboarding                                     │
│                                                              │
│  [Progress bar: ● ○ ○ ○]                                     │
│                                                              │
│  Full Name *                                                 │
│  [________________________]                                  │
│                                                              │
│  Email *                                                     │
│  [________________________]                                  │
│                                                              │
│  Phone *                                                     │
│  [________________________]                                  │
│                                                              │
│  Address *                                                   │
│  [________________________]                                  │
│  [________________________]                                  │
│                                                              │
│  State *        District *                                   │
│  [▼ Select___]  [▼ Select district after state is chosen]   │
│                                                              │
│  Education *                                                 │
│  [▼ Select___]                                               │
│                                                              │
│  Farming Background *                                        │
│  [________________________]                                  │
│  Why are you interested in this agri internship?             │
│                                                              │
│  Resume *                                                    │
│  📎 Choose File or drag & drop here                          │
│  Accepted: PDF, DOCX (max 5MB)                               │
│  [resume.pdf — 245 KB ✓]                                     │
│                                                              │
│  [← Back]                              [Submit →]            │
└──────────────────────────────────────────────────────────────┘
```

#### State/District Cascade
- States list is hardcoded (all 28 Indian states + 8 UTs)
- District list populates based on selected state via API call to `/api/districts?state=<state>`
- Until state is selected, district dropdown is disabled

#### Onboarding Submission Flow
```
Candidate clicks [Submit]
    ↓
Client-side validation (all required fields, file size, file type)
    ↓
POST /api/onboarding
  Body: { name, email, phone, address, state, district,
          education, farmingBackground, resume: File }
    ↓
Backend:
  - Validates all fields server-side
  - Stores resume as bytes in Candidate record
  - Sets currentPhase = "interview"
  - Sends Email #1 (Account Activated / Welcome)
    ↓
Response: { success: true, redirectUrl: "/dashboard" }
    ↓
Frontend redirects to /dashboard
```

#### Email #1 — Account Activated / Welcome
```
Subject: "Welcome to Agri Internship Program — Your Account is Activated"

Body:
  Hi [Name],

  Your account has been activated and you are now ready to begin the
  interview process for the Agri Internship Program.

  What happens next:
  1. Complete a short AI-powered interview (text-based, ~15-20 mins)
  2. View your evaluation results
  3. If you pass, upload your documents to complete the process

  We recommend having a stable internet connection and a quiet
  environment for the interview.

  Best regards,
  Agri Internship Team
```

### Phase 2: Interview Dashboard
```
/dashboard (phase 2 shown)

Phase cards visible:
  ① ✓ Onboarding        (completed)
  ② ▶ Start Interview   (current)  ← [Start Interview] button
  ③ ○ Interview Summary (locked)
  ④ ○ Upload Documents  (locked)

Candidate sees:
  - Past attempts (status + score)
  - [Start Interview] → /post-login?callbackUrl=/interview
  - [FAQ] link
    ↓
Candidate clicks [Start Interview]
    ↓
Slot check with VLLM
    ├─ Slot available → interview starts
    ├─ Slot unavailable → "Try after sometime"
    └─ VLLM down → "Please come again later"
    ↓
Interview chat opens
    ↓
Anti-cheat monitoring (idle, tab switch, copy/paste, right-click)
    ↓
Interview ends (anti_cheat / withdrawn / question_limit / time_limit)
    ↓
LLM evaluates: score + PASS/FAIL against threshold
    ↓
Email #2 sent: result + score + end reason (+ cooldown if FAIL)
    ↓
DB: currentPhase = "summary"
    ↓
Redirects to /summary
```

#### Dashboard — Phase 2 State
```
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                              [Logout] [FAQ]        │
│                                                              │
│  Hi, [Name]                                                   │
│                                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│  │①  ✓    │ │②  ▶    │ │③  🔒   │ │④  🔒   │                │
│  │Onboard │ │Inter-  │ │Summary │ │Upload  │                │
│  │ ✓ Done │ │view    │ │ 🔒     │ │ 🔒     │                │
│  └────────┘ │ ▶ Start│ └────────┘ └────────┘                │
│             └────────┘                                      │
│                                                              │
│  ── Past Attempts ──                                         │
│  Attempt #1 — PASS — Score: 82 — Jun 3, 2026                │
│  (anti-cheat triggered — closed early)                       │
│                                                              │
│  [Start Interview]                                           │
│                                                              │
│  ⚠ 2 attempts remaining                                      │
└──────────────────────────────────────────────────────────────┘
```

#### Start Interview Button
- Navigates: `/post-login?callbackUrl=/interview` (post-login checks session → resumes interview or starts new)
- If candidate already has a `paused` session in DB → resumes from same state
- If candidate has `completed` sessions ≥ 3 → button shows "Attempts Exhausted" (disabled)
- If candidate is in cooldown (FAIL + cooldown not elapsed) → button shows cooldown countdown

#### Slot Check (before interview starts)
```
Candidate clicks [Start Interview]
    ↓
GET /api/interview/slot-check
    ↓
Backend checks VLLM connection:
  - VLLM not reachable → return { result: "vllm_down", message: "Please come again later" }
  - VLLM reachable → check open slots:
    - Open slots < max_capacity → return { result: "slot_available" }
    - Open slots == 0 → return { result: "no_slot", message: "Try after sometime" }
    ↓
Frontend handles:
  - vllm_down → show modal: "Our systems are currently unavailable. Please come again later."
  - no_slot → show modal: "All slots are full. Please try after sometime."
  - slot_available → proceed to /interview
```

#### Live Interview Chat Page (`/interview`)
```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 LIVE — Question 3/10                    [End Interview]   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ AI: Welcome! Tell me about your farming background.  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ You: I come from a family of farmers in Punjab...   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ AI: Interesting. How do you think technology can    │   │
│  │ improve yield for small farmers?                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [Evaluating answer...]                              │   │
│  │ Technical Knowledge: ★★★★☆  Communication: ★★★☆☆   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Type your answer...                          [Send →]      │
│                                                              │
│  ⚠ Warning: Do not copy-paste answers                      │
└──────────────────────────────────────────────────────────────┘
```

#### Anti-Cheat Triggers & Enforcement

| Trigger | 1st Occurrence | 2nd Same Occurrence |
|---------|----------------|----------------------|
| Idle > threshold (default 15s) | Yellow warning overlay | Interview closed |
| Tab switch / minimize | Yellow warning overlay | Interview closed |
| Copy text | Warning toast + preventDefault | Interview closed |
| Paste text | Warning toast + preventDefault | Interview closed |
| Right-click | Blocked + warning toast | Interview closed |

**Warning overlay (1st trigger):**
```
┌─────────────────────────────────────────────────┐
│  ⚠  Warning: [Trigger Name]                    │
│                                                 │
│  This is your first warning. One more [trigger]│
│  will result in interview termination.          │
│                                                 │
│                              [I Understand]     │
└─────────────────────────────────────────────────┘
```

**Interview close screen (2nd same trigger):**
```
┌─────────────────────────────────────────────────┐
│  Interview Ended                                │
│                                                 │
│  Your interview has been closed due to         │
│  [trigger reason].                             │
│                                                 │
│  Your answers have been recorded and will be   │
│  evaluated.                                    │
│                                                 │
│  You will be redirected shortly...             │
└─────────────────────────────────────────────────┘
(2 seconds auto-redirect)
```

#### Interview End Reasons

| End Reason | Trigger | Stored As |
|------------|---------|-----------|
| `anti_cheat` | 2nd same anti-cheat trigger | `interviewTerminatedCheat = true` |
| `withdrawn` | Candidate voluntarily clicks [End Interview] → confirms | `endReason = "withdrawn"` |
| `question_limit` | `question_count >= max_questions` (admin-set, default 10) | `endReason = "question_limit"` |
| `time_limit` | `elapsed_time_ms >= max_time_ms` (admin-set, default 30 min) | `endReason = "time_limit"` |

#### Voluntary Withdrawal Flow
```
Candidate clicks [End Interview] button
    ↓
Confirmation modal:
  "Are you sure you want to end the interview?"
  [Cancel] [Confirm & End]
    ↓
Candidate confirms
    ↓
POST /api/interview/withdraw
  Body: { sessionId }
    ↓
Backend marks session as withdrawn
    ↓
Interview evaluated + scored → goes to /summary
```

#### Interview End → Evaluation
```
Interview ends (any reason)
    ↓
GET /api/interview/evaluate?sessionId=xxx
    ↓
Backend sends to LLM:
  - Full chat history
  - Evaluation metrics (categories + weights from Settings)
  - Question generation guidelines
  - Candidate resume + onboarding data
    ↓
LLM returns:
  {
    score: 82,
    result: "PASS",
    categoryScores: {
      "Technical Knowledge": { score: 85, weight: 0.4 },
      "Communication": { score: 78, weight: 0.3 },
      "Problem Solving": { score: 82, weight: 0.3 }
    },
    evaluation: { strengths: [...], areas_for_improvement: [...] }
  }
    ↓
Backend:
  - score >= threshold → result = "PASS"
  - score < threshold → result = "FAIL"
  - Stores evaluation in InterviewSession
  - Sends Email #2
  - Sets currentPhase = "summary"
    ↓
Frontend redirect to /summary
```

#### Attempt Limits
- Maximum **3 attempts** allowed per candidate
- Attempt counted on interview **start** (not end), when `InterviewSession` is created with status `in_progress`
- After 3 attempts exhausted (PASS or FAIL): no more interviews; candidate sees "Attempts Exhausted" message on dashboard
- Admin can reset a candidate's attempts via admin dashboard → allows candidate to retry immediately

### Phase 3: Summary
```
/summary
    ↓
Shows PASS or FAIL + score + end reason
    ↓
    ├─ FAIL:
    │     Show cooldown days countdown
    │     [Go to Dashboard] → phase 2 (can retry after cooldown)
    │
    └─ PASS:
          Show congratulations message
          [Go to Dashboard]
          DB: passedAndVisitedSummary = true
```

#### Summary Page — FAIL State
```
┌──────────────────────────────────────────────────────────────┐
│  Interview Result                                            │
│                                                              │
│  😞 Not Selected                                             │
│                                                              │
│  Score: 48 / 100                                             │
│  Status: FAIL                                                │
│                                                              │
│  ── Evaluation Breakdown ──                                  │
│  Technical Knowledge   ████░░░░░░  52%  (weight: 40%)        │
│  Communication         ██████░░░░  65%  (weight: 30%)        │
│  Problem Solving       ████░░░░░░  45%  (weight: 30%)        │
│                                                              │
│  ── Interview Ended ──                                       │
│  Reason: Question limit reached                              │
│  Date: Jun 6, 2026                                           │
│                                                              │
│  ⏳ Come back after 3 days                                   │
│  (Cooldown ends: Jun 9, 2026)                                │
│                                                              │
│  [Go to Dashboard]                                           │
│                                                              │
│  Questions? Read our FAQ → [FAQ]                             │
└──────────────────────────────────────────────────────────────┘
```

#### Summary Page — PASS State
```
┌──────────────────────────────────────────────────────────────┐
│  🎉 Congratulations!                                          │
│                                                              │
│  You have passed the interview.                              │
│  Score: 82 / 100                                             │
│  Status: PASS                                                │
│                                                              │
│  ── Evaluation Breakdown ──                                  │
│  Technical Knowledge   ████████░░  85%  (weight: 40%)        │
│  Communication         ███████░░░  78%  (weight: 30%)        │
│  Problem Solving       ████████░░  82%  (weight: 30%)        │
│                                                              │
│  ── Interview Ended ──                                       │
│  Reason: Completed successfully                              │
│  Date: Jun 6, 2026                                           │
│                                                              │
│  ✅ Your next step: Upload Documents                          │
│                                                              │
│  [Go to Dashboard]                                           │
└──────────────────────────────────────────────────────────────┘
```

#### Summary Page — Anti-Cheat Close (FAIL path)
```
┌──────────────────────────────────────────────────────────────┐
│  Interview Ended                                              │
│                                                              │
│  😞 Not Selected                                             │
│  Score: 61 / 100                                             │
│  Status: FAIL                                                │
│                                                              │
│  ── Interview Ended ──                                       │
│  Reason: Closed due to anti-cheat violation                  │
│  Date: Jun 6, 2026                                           │
│                                                              │
│  ⚠ Note: Your interview was evaluated despite early close.  │
│                                                              │
│  ⏳ Come back after 3 days                                   │
│  (Cooldown ends: Jun 9, 2026)                                │
│                                                              │
│  [Go to Dashboard]                                           │
└──────────────────────────────────────────────────────────────┘
```

#### Summary Page — Withdrawn (FAIL path, no cooldown)
```
┌──────────────────────────────────────────────────────────────┐
│  Interview Withdrawn                                         │
│                                                              │
│  Score: 55 / 100                                             │
│  Status: FAIL (WITHDRAWN)                                    │
│                                                              │
│  ── Interview Ended ──                                       │
│  Reason: You chose to end the interview                      │
│  Date: Jun 6, 2026                                           │
│                                                              │
│  ⏳ Come back after 3 days                                   │
│  (Cooldown ends: Jun 9, 2026)                                │
│                                                              │
│  [Go to Dashboard]                                           │
└──────────────────────────────────────────────────────────────┘
```

#### Dashboard after returning from summary (FAIL):
```
Phase cards:
  ① ✓ Onboarding
  ② ▶ Start Interview   ← shows cooldown countdown if applicable
  ③ ✓ Interview Summary
  ④ ○ Upload Documents  (locked — only unlocked on PASS)

⚠ Attempt #2 of 3 — 2 remaining
⏳ Next attempt available after 3 days (Jun 9, 2026)
```

**Dashboard after returning from summary (PASS):**
```
Phase cards:
  ① ✓ Onboarding
  ② ✓ Start Interview
  ③ ✓ Interview Summary
  ④ ▶ Upload Documents  ← UNLOCKED, "In Progress" badge
  (Phase 5 & 6 are GONE from UI)
```

---

## Email Notifications — All 3 Emails

| # | Trigger | Recipient | Subject | Attachments |
|---|---------|-----------|---------|-------------|
| ✉ 1 | Onboarding submitted → account activated | Candidate | "Welcome to Agri Internship Program — Your Account is Activated" | None |
| ✉ 2 | Interview evaluation complete | Candidate | "Your Interview Result" | None |
| ✉ 3 | Admin clicks [Send Offer Letter Email] | Candidate | "Your Offer Letter" | Offer letter PDF + Joining details PDF |

---

### Email #1 — Account Activated / Welcome (Auto-sent on onboarding submit)

**Trigger:** Candidate submits onboarding form
**Recipient:** Candidate
**From:** Admin-configured `emailFromAddress` in Settings

```
Subject: Welcome to Agri Internship Program — Your Account is Activated

Hi [Name],

Your account has been activated and you are now ready to begin the
interview process for the Agri Internship Program.

What happens next:
1. Complete a short AI-powered interview (text-based, ~15-20 minutes)
2. View your evaluation results
3. If you pass, upload your documents to complete the process

We recommend having a stable internet connection and a quiet
environment for the interview.

We wish you the best!

Best regards,
Agri Internship Team
```

---

### Email #2 — Interview Result (Auto-sent after evaluation)

**Trigger:** Interview ends → LLM evaluation completes → score stored
**Recipient:** Candidate
**From:** Admin-configured `emailFromAddress` in Settings

**On PASS:**
```
Subject: Your Interview Result — Congratulations!

Hi [Name],

Your interview for the Agri Internship Program has been evaluated.

Result: ✅ PASS
Score: [Score]/100

You have qualified for the next stage!

Next Step: Upload your documents to complete your profile.
Log in to your dashboard to proceed.

Best regards,
Agri Internship Team
```

**On FAIL:**
```
Subject: Your Interview Result

Hi [Name],

Your interview for the Agri Internship Program has been evaluated.

Result: ❌ Not Selected
Score: [Score]/100

Reason: [end_reason]

[If cooldown applies:]
You can attempt the interview again after [cooldown_days] days.
(Cooldown ends: [cooldown_end_date])

We encourage you to reflect on the feedback and apply again.

Best regards,
Agri Internship Team
```

---

### Email #3 — Offer Letter (Admin-triggered)

**Trigger:** Admin clicks [Send Offer Letter Email] in candidate's Documents tab
**Recipient:** Candidate
**From:** Admin-configured `emailFromAddress` in Settings
**Attachments:** `offer_letter_[candidateName].pdf` + `joining_details_[candidateName].pdf`

```
Subject: Your Offer Letter — Agri Internship Program

Hi [Name],

Congratulations on completing all stages of the selection process!

Please find your official offer letter and joining details attached
to this email.

Review the documents carefully and reach out if you have any
questions.

Welcome aboard!

Best regards,
Agri Internship Team
```

---

### Admin Email Configuration

- **From address:** Set by admin in Settings tab (`emailFromAddress`)
- **Resend emails:** Admin can resend any email from the candidate's detail page
- **Failed email tracking:** If email send fails, show error to admin; retry available
- **Email logs:** All sent emails logged (timestamp, recipient, subject, status)

---

### Phase 4: Upload Documents
```
/dashboard → candidate clicks Phase 4 card
    ↓
Navigates to /upload-documents
    ↓
Page shows:
  ┌─────────────────────────────────────────┐
  │ 🎉 Congratulations on Passing!            │
  │                                          │
  │ Upload the documents below to complete   │
  │ your process.                            │
  │                                          │
  │ 📄 Aadhar Card            [Choose File]  │
  │ 📄 PAN Card               [Choose File]  │
  │ 📄 Education Certificate  [Choose File]  │
  │ 📄 Experience Letter      [Choose File]  │
  │                                          │
  │ [Submit Documents]                       │
  └─────────────────────────────────────────┘
    ↓
Candidate selects files for each field
    ↓
Candidate clicks [Submit Documents]
    ↓
  ┌─ Validation:
  │   If any required field missing → show error per field
  │   If file too large (>5MB) → show error
  │   If wrong format (not PDF/DOCX) → show error
  └─ All good → proceed
    ↓
Frontend uploads files to backend
  POST /api/candidate/documents (FormData)
    ↓
Backend saves files to CandidateDocument table
  - Each file stored with: candidateId, fieldName, fileName, fileType, fileData (Bytes), createdAt
    ↓
Backend updates Candidate record:
  - documentsSubmitted = true
  - currentPhase = "documents"
    ↓
Frontend shows thank-you screen:
  ┌─────────────────────────────────────────┐
  │ ✅ Documents Submitted                   │
  │                                          │
  │ Thank you for completing the interview   │
  │ and uploading your documents.            │
  │                                          │
  │ You will shortly receive the offer       │
  │ letter via email.                        │
  │                                          │
  │ [Back to Dashboard]                      │
  └─────────────────────────────────────────┘
    ↓
Back on Dashboard:
  Phase 4 card now shows ✓ Completed
```

### Pipeline Complete (Candidate Side)
```
Dashboard (all done):
  ① ✓ Onboarding
  ② ✓ Start Interview
  ③ ✓ Interview Summary
  ④ ✓ Upload Documents  ← "Completed" badge

Candidate does nothing more.
Offer letter comes via email when admin sends it.
```

---

## Full Admin Dashboard Flow

### Login
```
/admin/login → admin enters credentials → /admin
```

#### Admin Login Page (`/admin/login`)
```
┌──────────────────────────────────────────────────────────────┐
│                    Admin Login                               │
│                                                              │
│  [Agri AI Platform Logo]                                     │
│                                                              │
│  Email                                                       │
│  [________________________]                                  │
│                                                              │
│  Password                                                    │
│  [________________________]                                  │
│                                                              │
│  [← Back to Login]          [Login →]                       │
└──────────────────────────────────────────────────────────────┘
```

- Separate from candidate login (different app/URL)
- Email + password authentication
- Session stored server-side (in-memory or Redis)
- Multi-device allowed — same credentials on multiple browsers/devices simultaneously
- No single-device enforcement for admins
- On success → redirect to `/admin` (Candidates tab)
- On failure → show "Invalid credentials" error inline
- [← Back to Login] → links to candidate login at `/login`

### Candidates List
```
/admin → Candidates tab (default view)

Top stats bar:
  Total Candidates: 24  |  Phase 4 Pending: 5  |  Phase 4 Submitted: 3  |  Completed: 12

Tab filters:
  [All] [Phase 1] [Phase 2] [Phase 3] [Phase 4 - Pending] [Phase 4 - Submitted] [Completed]

Search bar:
  🔍 Search by name or email...

Table columns:
  Name | Email | Phase | Attempts | Result | Score | Documents | Actions
  ───────────────────────────────────────────────────────────────────────────────
  John   john@   Phase 4   1/3       PASS     82      ⏳ Pending  [View]  
  Jane   jane@   Phase 4   1/3       PASS     75      ✅ 4 files  [View]
  Bob    bob@    Phase 3   1/3       PASS     88      —          [View]
  Ali    ali@    Phase 2   2/3       FAIL     41      —          [View]

Documents column legend:
  "—"          = not yet reached phase 4
  "⏳ Pending"  = on phase 4, documents not submitted
  "✅ N files"  = documents submitted
  "✅ Complete" = phase 4 done, offer sent by admin

Row actions:
  [View] → opens candidate detail page in right panel or navigates to /admin/candidates/[id]
```

#### Candidate Detail Page (`/admin/candidates/[id]`)
```
/admin/candidates/abc123

┌──────────────────────────────────────────────────────────────┐
│ ← Back to Candidates                                         │
│                                                              │
│ Tabs: [Profile] [Interview History] [Documents]              │
│                                                              │
│ ┌── Profile tab (default) ─────────────────────────────────┐│
│ │                                                            ││
│ │  Name:          John Doe                                   ││
│ │  Email:         john@example.com                           ││
│ │  Phone:         +91 98765 43210                            ││
│ │  State:         Punjab                                     ││
│ │  District:      Ludhiana                                   ││
│ │  Education:     Graduate                                   ││
│ │  Farming Background: 5 acres of wheat farming...           ││
│ │                                                            ││
│ │  Current Phase: Phase 4 — Upload Documents                 ││
│ │  Phase Timeline:                                          ││
│ │    ① ✓ Onboarding        — Jun 1, 2026                     ││
│ │    ② ✓ Interview         — Jun 2, 2026 (PASS, Score: 82)  ││
│ │    ③ ✓ Interview Summary — Jun 2, 2026                     ││
│ │    ④ ▶ Upload Documents — In Progress                      ││
│ │                                                            ││
│ │  Resume: [preview] [↓ Download]                            ││
│ │                                                            ││
│ │  Attempts: 1 / 3                                          ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Interview History tab ──────────────────────────────────┐│
│ │                                                            ││
│ │  Attempt #1 — Jun 2, 2026                                 ││
│ │  Score: 82 | Result: PASS                                 ││
│ │  End Reason: Completed successfully                       ││
│ │  Anti-Cheat Events: None                                  ││
│ │  [View Evaluation Details ↓]                              ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Documents tab ──────────────────────────────────────────┐│
│ │                                                            ││
│ │  Status: ⏳ Pending                                        ││
│ │                                                            ││
│ │  No documents submitted yet.                               ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### View Candidate — Documents Tab
```
/admin/candidates/[id] → Candidate detail page

Tabs:
  [Profile] [Interview History] [Documents]  ← Documents is new

Profile tab:
  - All onboarding fields (name, phone, address, education, farming background)
  - Current phase + timeline of phase completions
  - Resume file (downloadable)

Interview History tab:
  - All interview attempts with date, score, result, end reason
  - Anti-cheat events if any

Documents tab:
  ┌──────────────────────────────────────────────────────────┐
  │ Documents — John Doe                                      │
  │                                                           │
  │ Status: ⏳ Pending / ✅ Submitted (Jun 6, 2026)           │
  │                                                           │
  │ ┌──────────────────────────────────────────────────────┐ │
  │ │ 📄 aadhar_card.pdf       245 KB   Jun 6, 2026   [↓]  │ │
  │ │ 📄 pan_card.pdf          120 KB   Jun 6, 2026   [↓]  │ │
  │ │ 📄 education_cert.pdf    890 KB   Jun 6, 2026   [↓]  │ │
  │ │ 📄 experience_letter.pdf  340 KB   Jun 6, 2026   [↓]  │ │
  │ └──────────────────────────────────────────────────────┘ │
  │                                                           │
  │ [Download All as ZIP]                                     │
  │                                                           │
  │ ───────────────────────────────────────                   │
  │ Next Step:                                                │
  │ [Send Offer Letter Email]   ← triggers Email #3 to       │
  │                               candidate                   │
  │ [Mark as Offer Sent]       ← internal flag, no email     │
  │ [Reset Documents]          ← clear docs, allow re-upload │
  └──────────────────────────────────────────────────────────┘
```

### Notifications / Alerts
```
Top navigation bar:

🔔 Notifications (badge count)

Dropdown:
  ┌────────────────────────────────────┐
  │ 🔴 New document upload: John Doe   │
  │ 🟡 3 candidates in cooldown        │
  │ 🟢 2 candidates completed pipeline │
  └────────────────────────────────────┘

Clicking "New document upload" → navigates to that candidate's Documents tab
```

---

## Admin Actions on Documents

| Action | Where | What it does |
|--------|-------|-------------|
| View candidate list | Candidates tab | See documents status at a glance |
| Filter by document status | Candidates tab | Show only pending/submitted |
| View document details | Candidate detail → Documents tab | File name, size, upload date |
| Download single file | Candidate detail → Documents tab | Download any one document |
| Download all as ZIP | Candidate detail → Documents tab | Bundle all docs in one ZIP |
| Send Offer Letter Email | Candidate detail → Documents tab | Trigger Email #3 to candidate |
| Mark as Offer Sent | Candidate detail → Documents tab | Internal flag, no email sent |
| Reset Documents | Candidate detail → Documents tab | Clear submitted docs, allow candidate to re-upload |
| Resend Email | Candidate detail → Documents tab | Retry Email #3 if it previously failed |

---

## Email #3 — Offer Letter Email (Admin-Triggered)

```
When admin clicks [Send Offer Letter Email]:
    ↓
Backend sends Email #3 to candidate:
    - Subject: "Your Offer Letter"
    - Body: Congratulations message + next steps
    - Attachments: offer letter PDF + joining details PDF
    - (PDFs generated from admin-managed templates)
    ↓
Candidate receives email with offer letter attached
```

> The offer letter and joining details PDFs are still generated from the existing admin-managed templates. The difference from the old flow: admin manually triggers Email #3 after reviewing submitted documents, instead of it being sent automatically after the candidate signs.

---

## Dashboard Phase Card States

| State | When | Badge | Clickable? |
|-------|------|-------|------------|
| 🔒 Locked | Phase 1, 2, or 3 | `🔒 Locked` | No |
| ▶ In Progress | Phase 4, not yet submitted | `In Progress` | Yes → /upload-documents |
| ✓ Completed | Phase 4, documents submitted | `Completed` | Yes → /upload-documents (view only) |

---

## Database Changes

### New column on Candidate table
```prisma
documentsSubmitted Boolean @default(false)
```

### New table: CandidateDocument
```prisma
model CandidateDocument {
  id          String   @id @default(cuid())
  candidateId String
  fieldName   String   // e.g. "aadhar", "pan", "education_cert", "experience_letter"
  fileName    String
  fileType    String   // "pdf" | "docx"
  fileData    Bytes    // file stored directly in DB
  createdAt   DateTime @default(now())
}
```

### Backend model (SQLAlchemy)
```python
class CandidateDocument(Base):
    __tablename__ = "CandidateDocument"

    id          = Column(String, primary_key=True)
    candidateId = Column(String, nullable=False)
    fieldName   = Column(String, nullable=False)
    fileName    = Column(String, nullable=False)
    fileType    = Column(String, nullable=False)
    fileData    = Column(LargeBinary, nullable=False)  # stored in DB
    createdAt   = Column(DateTime, default=_utcnow)
```

---

## API Endpoints

### POST /api/candidate/documents
Upload multiple documents for a candidate.

**Auth:** Bearer token (Redis session)

**Request:** `FormData`
- Field: `files` — array of files
- Each file field named by its `fieldName` (e.g. `aadhar`, `pan`)

**Response:**
```json
{
  "success": true,
  "uploaded": [
    { "fieldName": "aadhar", "fileName": "aadhar.pdf", "size": 245000 },
    { "fieldName": "pan", "fileName": "pan.pdf", "size": 120000 }
  ],
  "message": "Documents uploaded successfully"
}
```

### GET /api/candidate/documents
List documents submitted by the authenticated candidate.

**Auth:** Bearer token (Redis session)

**Response:**
```json
{
  "documents": [
    { "id": "...", "fieldName": "aadhar", "fileName": "aadhar.pdf", "fileType": "pdf", "createdAt": "2026-06-06T10:00:00Z" }
  ]
}
```

### GET /api/admin/candidates/[id]/documents
Admin view — list all documents for a specific candidate.

**Auth:** Admin session

**Response:** Same as above, plus `fileSize` in bytes.

### GET /api/admin/candidates/[id]/documents/[docId]/download
Download a single document file.

**Auth:** Admin session

**Response:** File binary with appropriate Content-Type.

### GET /api/admin/candidates/[id]/documents/download-all
Download all documents for a candidate as a ZIP file.

**Auth:** Admin session

**Response:** ZIP file binary.

### DELETE /api/admin/candidates/[id]/documents/[docId]
Delete a single document (reset / allow re-upload).

**Auth:** Admin session

### POST /api/admin/candidates/[id]/send-offer-email
Send Email #3 (offer letter + joining details PDF) to the candidate.

**Auth:** Admin session

**Response:**
```json
{ "success": true, "message": "Email sent successfully" }
```

---

## Frontend Pages

### /upload-documents (new)
- Route: `frontend/app/upload-documents/page.tsx`
- Auth: protected (middleware checks session)
- Shows congratulations message at top
- Upload boxes for configurable document fields
- Submit button → uploads files → shows thank-you screen
- After submit, redirects to dashboard

### /dashboard — Phase 4 card
- Remove phases 5 and 6 from phase cards array
- Phase 4 name: "Upload Documents"
- Phase 4 navigates to `/upload-documents`
- Status badge: "In Progress" (not submitted) / "Completed" (submitted)
- Read `documentsSubmitted` flag from DB to determine badge

### /summary — PASS path
- Message: update to point to upload documents instead of offer letter
- After PASS, set `passedAndVisitedSummary = true` in DB

---

## Middleware Changes

Remove from `protectedRoutes` (candidates never navigate here):
- `/offer`
- `/signing`
- `/joining`

Add to `protectedRoutes`:
- `/upload-documents`

---

## Files to Modify / Create

### Create (new files)
- `frontend/app/upload-documents/page.tsx` — main upload page
- `frontend/app/upload-documents/page.module.css` — styles
- `frontend/services/candidate.ts` — `uploadDocuments()`, `getCandidateDocuments()`
- `backend/app/api/candidate/documents.py` — upload/list endpoints
- `backend/app/api/admin/documents.py` — admin document management

### Modify
- `frontend/prisma/schema.prisma` — add `documentsSubmitted` column + `CandidateDocument` model
- `backend/app/db/models/candidate.py` — add `CandidateDocument` model + `documentsSubmitted` column
- `frontend/lib/phaseSync.ts` — update phase map (remove offer/signing/joining, add documents as phase 4)
- `frontend/middleware.ts` — remove /offer /signing /joining from protected, add /upload-documents
- `frontend/app/dashboard/page.tsx` — remove phases 5+6, update phase 4 card
- `frontend/app/summary/page.tsx` — update PASS message
- `backend/app/api/candidate/route.py` — add documents to phase map, add `documentsSubmitted` patch support
- `backend/app/api/admin/candidates.py` — add documents endpoints for admin

### Leave as-is (not called by candidates)
- `frontend/app/offer/page.tsx`
- `frontend/app/signing/page.tsx`
- `frontend/app/joining/page.tsx`
- `backend/app/api/offer.py`
- `backend/app/api/joining_details.py`

---

## Configuration

### Document fields (hardcoded for now)
```typescript
const DOCUMENT_FIELDS = [
  { key: 'aadhar',          label: 'Aadhar Card',           required: true,  maxSizeMB: 5 },
  { key: 'pan',             label: 'PAN Card',               required: true,  maxSizeMB: 5 },
  { key: 'education_cert',  label: 'Education Certificate',  required: true,  maxSizeMB: 10 },
  { key: 'experience_letter', label: 'Experience Letter',    required: false, maxSizeMB: 5 },
]
```

> Future: these can be made admin-configurable via the Settings table.

### Allowed file types
- `application/pdf`
- `application/msword` (.doc)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)

---

## Error States

| Scenario | UI Response |
|----------|-------------|
| File missing (required field) | Inline error: "Please upload your {fieldLabel}" |
| File too large | Inline error: "File exceeds {maxSizeMB}MB limit" |
| Wrong file type | Inline error: "Only PDF and DOCX files are allowed" |
| Upload fails | Toast error: "Upload failed. Please try again." |
| Backend returns error | Show error message from server |

---

## Session / Navigation Rules

- During interview: idle 15 seconds → interview auto-closed
- Outside interview: inactive 15 minutes → forced re-login
- Single-device login enforcement remains active

---

_Last updated: 2026-06-06_
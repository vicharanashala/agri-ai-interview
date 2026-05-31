# TASK-012: Interview Queue System

## Objective
Implement a FIFO queue system to manage candidate interview capacity. Since the LLM-backed interview has a hard concurrency limit (e.g., 10 simultaneous interviews), a queue gate is introduced so candidates can request an interview slot and receive a scheduled time. Candidates who miss their slot are skipped and must re-request. Pre-interview flows (onboarding, FAQ, candidate portal) remain fully open and unrestricted.

**Key design decisions:**
- Dynamic pool model: up to N candidates interview concurrently; 11th candidate queues
- Queue full → immediate "try again later" (no queuing into a dead queue)
- Two types of interruptions: **interruption** (resume from saved point) vs **cancellation** (fresh start)
- 5-minute join window once slot opens; no-show → skipped with cooldown
- Wait time: actual slot timing for positions 1-2; formula-based estimate for 3+

---

## Phase 1: Database Schema Changes ✅
- [x] 1.1 Add `InterviewQueueEntry` model to Prisma schema
- [x] 1.2 Add `InterviewStateSnapshot` model to Prisma schema
- [x] 1.3 Update `InterviewSession` model — add `queueEntryId` and `startedViaQueue` fields
- [x] 1.4 Update SQLAlchemy mirror in `candidate.py` to match new Prisma models
- [x] 1.5 Run `npx prisma db push` and verify migration

## Phase 2: Queue Manager (Backend Core)
- [ ] 2.1 Create `app/services/queue_manager.py`
- [ ] 2.2 Implement `join_queue()` — handles queue_full, cooldown, new entry
- [ ] 2.3 Implement `advance_queue()` — moves next candidate QUEUED → READY
- [ ] 2.4 Implement `mark_ready()` — assigns candidate to open slot
- [ ] 2.5 Implement `confirm_join()` — candidate arrives within join window
- [ ] 2.6 Implement `start_interview()` — returns interview_id + first_question + resume info
- [ ] 2.7 Implement `pause_interview()` — saves snapshot on interruption (crash/disconnect)
- [ ] 2.8 Implement `resume_interview()` — resumes from saved snapshot (interruption path only)
- [ ] 2.9 Implement `cancel_interview()` — voluntary cancel, cooldown, no snapshot saved
- [ ] 2.10 Implement `skip_candidate()` — no-show/timeout, cooldown + skip_count++
- [ ] 2.11 Implement `complete_interview()` — marks done, advances queue
- [ ] 2.12 Implement cooldown enforcement (skip cooldown, cancel cooldown)
- [ ] 2.13 Track `active_interview_count` with crash recovery via DB persistence

## Phase 3: Wait Time Calculator ✅
- [x] 3.1 Implement rolling average calculation (last 100 completed interviews duration)
- [x] 3.2 Implement `get_estimated_wait()` — position 3+ uses formula: `candidates_ahead × avg_duration / max_slots`
- [x] 3.3 Implement `get_actual_wait()` — position 1-2 uses `time_until_next_slot_opens`
- [x] 3.4 Track `startedAt` and `completedAt` on each interview for duration calculation
- [x] 3.5 Handle empty historical data — fallback to hardcoded estimate with "approximate" flag

## Phase 4: Queue API Endpoints ✅
- [x] 4.1 Create `app/api/interview/queue.py` with FastAPI router
- [x] 4.2 Add `POST /api/interview/queue/request` — join queue endpoint
- [x] 4.3 Add `GET /api/interview/queue/status` — candidate's current queue status
- [x] 4.4 Add `POST /api/interview/queue/join` — candidate confirms arrival (within window)
- [x] 4.5 Add `DELETE /api/interview/queue/cancel` — voluntary cancel with cooldown
- [x] 4.6 Add `POST /api/interview/queue/skip/{candidate_id}` — admin or timeout trigger
- [x] 4.7 Add `GET /api/interview/queue/stats` — admin view: queue depth, active counts, avg wait
- [x] 4.8 Add `POST /api/interview/pause` — save snapshot on interruption
- [x] 4.9 Add `POST /api/interview/resume` — resume from snapshot
- [x] 4.10 Modify `POST /api/interview/start` — gate behind queue READY state

## Phase 5: Frontend — Queue Status Page ✅
- [x] 5.1 Create `/app/interview/queue/page.tsx`
- [x] 5.2 QUEUED state: show position + estimated wait + cancel button
- [x] 5.3 QUEUE_FULL state: show "try again later" message
- [x] 5.4 COOLDOWN state: show cooldown countdown + retry button after expiry
- [x] 5.5 READY state: show "Join within 5 minutes" + countdown + prominent Join button
- [x] 5.6 PAUSED state: show resume option + "Request to resume" button
- [x] 5.7 Auto-redirect from READY to queue page if 5-minute window expires
- [x] 5.8 Polling or SSE for queue position updates (every 30s or on state change)
- [x] 5.9 Show "estimated" vs "based on active interviews" label on wait time

## Phase 6: Frontend — Interview Page Updates ✅
- [x] 6.1 On "Start Interview" click from dashboard → call `POST /api/interview/queue/request`
- [x] 6.2 If queue_full or cooldown → redirect to `/interview/queue` instead of instructions
- [x] 6.3 READY state → "Join Interview" button calls `POST /api/interview/queue/join` then proceeds
- [x] 6.4 On page load: check PAUSED state → show resume option
- [x] 6.5 Add 5-minute join window countdown on Ready screen
- [x] 6.6 Cancel button during interview → call `DELETE /api/interview/queue/cancel` before ending
- [x] 6.7 Show "interview resumes from where you left off" message for interrupted candidates

## Phase 7: Notification System ✅
- [x] 7.1 Create `app/services/notification_service.py`
- [x] 7.2 Implement email notifications (use existing email service — SendGrid/SES)
- [x] 7.3 Notify on `join_queue` — queue position + estimated wait
- [x] 7.4 Notify when candidate reaches position 2 — "approaching your slot"
- [x] 7.5 Notify on `mark_ready` — "your slot is ready, join within 5 minutes"
- [x] 7.6 Notify on cooldown expiry — "ready to retry"
- [x] 7.7 Notify on skip — "you missed your slot, re-request after cooldown"

## Phase 8: Scheduled Job — Slot Monitor ✅
- [x] 8.1 Create `app/jobs/slot_monitor.py` (runs every 30s via FastAPI BackgroundTasks)
- [x] 8.2 Expire stale READY entries (scheduledAt + 5min < now) → skip + advance queue
- [x] 8.3 Expire stale PAUSED entries (older than 24h) → clear snapshot + free slot
- [x] 8.4 Trigger `advance_queue()` after each skip to fill the slot

## Phase 9: Admin Dashboard — Queue View
- [ ] 9.1 Add "Queue" tab to admin dashboard (in LiveTab.tsx or new tab)
- [ ] 9.2 Show current queue depth (N candidates waiting)
- [ ] 9.3 Show active interviews count vs max capacity
- [ ] 9.4 List queued candidates: position, wait time, status
- [ ] 9.5 List READY candidates with time-since-notified (spot no-shows)
- [ ] 9.6 Show skip count per candidate
- [ ] 9.7 Manual override: "Skip" and "Cancel" buttons per entry
- [ ] 9.8 "Pause" active interview (simulate interruption for testing)

## Phase 10: End-to-End Testing
- [ ] 10.1 Test: 11th candidate joins → queue_full message, no DB entry
- [ ] 10.2 Test: 10 active, slot opens → #1 moves READY, notification sent
- [ ] 10.3 Test: READY candidate doesn't join in 5 min → skipped, cooldown applied
- [ ] 10.4 Test: Candidate cancels mid-interview → cooldown, fresh start on re-entry (no resume)
- [ ] 10.5 Test: Candidate disconnects (interruption) → state saved, resume works from saved point
- [ ] 10.6 Test: Candidate re-joins after cooldown → back of queue (fair queueing)
- [ ] 10.7 Test: Skip count reaches 3 → flagged in admin dashboard
- [ ] 10.8 Test: Server restarts → queue state recovered from DB
- [ ] 10.9 Test: Wait time shows "based on active interviews" for position 1-2
- [ ] 10.10 Test: Wait time shows "estimated" for position 3+

---

## Candidate State Machine (Reference)

```
REQUEST
   │
   ▼
┌──────────────┐   slot opens + candidate is next   ┌───────────────┐
│   QUEUED     │ ─────────────────────────────────▶│   READY       │
│ position: N  │                                    │ join in 5 min │
│ wait: ~X min │   slot opens, notify candidate     └───────┬───────┘
└──────────────┘                                       │
       ▲                                               │ join within 5 min
       │ re-request (after cooldown)                   ▼
       │                                        ┌──────────────┐
┌──────────────┐   missed window              │ INTERVIEWING │
│   SKIPPED    │ ◀────────────────────────────┤ (in progress)│
│  (cooldown)  │                              └───────┬──────┘
└──────────────┘    candidate cancels                   │
       │                                            ┌────┴────┐
       │ not immediate                 interruption │        │ all done
       │ cooldown on skip                         ▼        ▼
       │                               ┌────────────┐  COMPLETED
       │                               │  PAUSED    │
       │                               │(state saved)│
       │                               └──────┬─────┘
       │                                      │ re-request after cooldown
       └──────────────────────────────────────┘

VOLUNTARY CANCEL → CANCELLED → cooldown → re-request → FRESH START (no resume)
```

---

## Files to Create
- `backend/app/services/queue_manager.py`
- `backend/app/services/notification_service.py`
- `backend/app/jobs/slot_monitor.py`
- `backend/app/api/interview/queue.py`
- `frontend/app/interview/queue/page.tsx`

## Files to Modify
- `frontend/prisma/schema.prisma`
- `backend/app/db/models/candidate.py`
- `backend/app/api/interview/route.py`
- `frontend/app/interview/page.tsx`
- `frontend/app/dashboard/page.tsx`
- `frontend/components/admin/LiveTab.tsx`
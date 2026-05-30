# TASK-008: Anti-Cheating System

## Objective
Implement measures to ensure interview integrity and prevent cheating during AI interviews.

---

## Status: MOSTLY COMPLETE

**Mostly complete (2026-05-27). Multi-monitor + idle detection + 15s auto-close implemented. Anomalous behavior detection + security levels remaining.**

---

## Implemented (Frontend — ✅ Done)

### Browser Monitoring ✅
- [x] Tab switching detection
- [x] Window focus tracking
- [x] Right-click disable
- [x] Copy/paste prevention

### Enforcement Policy ✅
- **1st offense** (per cheating type): Warning notification to candidate
- **2nd offense** (same cheating type): Interview auto-ended immediately
- Offenses tracked per-cheating-type (tab-switch, copy-paste, etc. each have separate buckets)

### Admin Interface ✅
- [x] 🛡️ Anti-Cheat tab in admin dashboard (nav tab + full UI)
- [x] Summary stats: total events, per-type breakdown
- [x] Top violators card list
- [x] Critical events (terminations) panel
- [x] Full event log table with type filter + timestamp (IST)
- [x] Auto-refresh on tab switch

### Admin Interface — Simple Violations Table ✅ (2026-05-27)
- [x] 🛡️ **Anti-Cheat tab** added to admin dashboard (🛡️ Anti-Cheat button)
- [x] `GET /api/admin/anti-cheat/violations` — enriched endpoint with LEFT JOIN on Candidate + User
  - Returns: candidate name, email, violation type, severity, message, timestamp, autoClosed
- [x] Table: Candidate Name | Email | Violation | Severity | Auto-Closed? | Time (IST)
- [x] Auto-refresh every 5s when tab is open

---

## Implemented (Backend — ✅ Done 2026-05-27)

### Backend Session Monitoring ✅
- [x] Activity log storage to database (AntiCheatEvent model in Prisma)
- [x] `POST /api/admin/anti-cheat/events` — log violation events
- [x] `GET /api/admin/anti-cheat/events` — fetch events (filterable by candidate/interview/type)
- [x] `GET /api/admin/anti-cheat/summary` — counts by type, critical events, top violators
- [x] Internal service token auth (INTERNAL_SERVICE_TOKEN env var)
- [x] `POST /api/anti-cheat/log` — Next.js proxy route for candidate frontend

### Recording & Evidence (Partial) ✅
- [x] Activity log storage (backend, DB-backed)

---

## Planned / Remaining

### Browser Monitoring (Frontend — Planned)
- [ ] Full-screen mode enforcement
- [x] Multiple monitor detection ✅ (2026-05-27)
- [x] Idle detection (10s inactivity warning) ✅ (2026-05-27)
- [x] Auto-close warning overlay after 15s of no response ✅ (2026-05-27)

### Backend Session Monitoring (Partial)
- [ ] Anomalous behavior detection
- [ ] Time-based pattern analysis
- [ ] Suspicious activity flagging

### Prevention Measures (Frontend — Partial)
- [ ] Text selection limiting
- [ ] Screenshot prevention indicator (visual warning)

### Recording & Evidence (Partial)
- [ ] Evidence package generation

### Security Levels (Not Started)
| Level | Measures | Use Case |
|-------|----------|----------|
| Basic | Tab monitoring | Standard interviews |
| Standard | + Copy prevention | Technical roles |
| Strict | + Full enforcement | Senior positions |

---

## Acceptance Criteria

- [x] Tab switches detected and logged
- [x] Violations logged to backend database
- [x] Admin can review integrity incidents (via Anti-Cheat tab)
- [ ] Suspicious patterns detected (backend — anomalous behavior detection)
- [ ] Fair evaluation maintained

---

## Dependencies

- TASK-001: Project Bootstrap (base infrastructure)
- TASK-004: Interview System (session management)

---

## Files Changed (2026-05-27)

### Backend
- `backend/app/api/admin/candidates.py` — added anti-cheat event endpoints
- `backend/app/api/admin/middleware.py` — added INTERNAL_SERVICE_TOKEN support
- `backend/app/main.py` — registered candidates router (already present)

### Frontend
- `frontend/prisma/schema.prisma` — added AntiCheatEvent model
- `frontend/app/api/anti-cheat/log/route.ts` — new Next.js proxy route
- `frontend/hooks/useAntiCheat.ts` — multi-monitor + idle (10s) detection added
- `frontend/app/interview/page.tsx` — wired up logging on violations
- `frontend/components/AntiCheatOverlay.tsx` — 15s auto-close countdown timer added
- `frontend/components/AntiCheatOverlay.module.css` — countdown style
- `frontend/app/admin/dashboard/page.tsx` — added anti-cheat tab + data fetching
- `frontend/app/admin/dashboard/dashboard.module.css` — anti-cheat tab styles

## Status
- **Created**: 2026-05-20
- **Priority**: MEDIUM
- **Implementation Started**: Yes
- **Last Updated**: 2026-05-27 (admin tab + violations endpoint + multi-monitor + idle detection + 15s auto-close)
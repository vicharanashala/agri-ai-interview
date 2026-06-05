-- ============================================================
-- Agri Interview Platform — Full Postgres Schema
-- Generated from Prisma schema.prisma
-- ============================================================

BEGIN;

-- ── Account (NextAuth) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Account" (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    userId            TEXT NOT NULL,
    type              TEXT NOT NULL,
    provider          TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token     TEXT,
    access_token      TEXT,
    expires_at        INTEGER,
    token_type        TEXT,
    scope             TEXT,
    id_token          TEXT,
    session_state     TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"(provider, providerAccountId);

-- ── Session (NextAuth) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Session" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    sessionToken TEXT UNIQUE NOT NULL,
    userId       TEXT NOT NULL,
    expires      TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"(userId);

-- ── User (NextAuth) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "User" (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT,
    email         TEXT UNIQUE,
    emailVerified TIMESTAMPTZ,
    image         TEXT,
    password      TEXT,
    createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"(email);

-- ── VerificationToken (NextAuth) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "VerificationToken" (
    identifier TEXT NOT NULL,
    token      TEXT NOT NULL,
    expires    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- ── Admin ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Admin" (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    name       TEXT,
    createdAt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "Admin_email_idx" ON "Admin"(email);

-- ── Candidate ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Candidate" (
    id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"                 TEXT UNIQUE NOT NULL,
    fullName                 TEXT,
    phone                    TEXT,
    state                    TEXT,
    district                 TEXT,
    pincode                  TEXT,
    address                  TEXT,
    currentRole              TEXT,
    yearsOfExperience        INTEGER,
    highestEducation         TEXT,
    institution              TEXT,
    farmingBackground        TEXT,
    cropsGrown               TEXT,
    farmSize                 TEXT,
    primaryExpertise         TEXT,
    currentPhase             TEXT NOT NULL DEFAULT 'onboarding',
    offerLetterViewed        BOOLEAN NOT NULL DEFAULT FALSE,
    passedAndVisitedSummary  BOOLEAN NOT NULL DEFAULT FALSE,
    joiningDetailsVisited    BOOLEAN NOT NULL DEFAULT FALSE,
    createdAt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Candidate_userId_idx" ON "Candidate"("userId");
CREATE INDEX IF NOT EXISTS "Candidate_currentPhase_idx" ON "Candidate"(currentPhase);

-- ── ActiveInterviewCount (Singleton) ─────────────────────────
CREATE TABLE IF NOT EXISTS "ActiveInterviewCount" (
    id        TEXT PRIMARY KEY DEFAULT 'singleton',
    count     INTEGER NOT NULL DEFAULT 0,
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── InterviewQueueEntry ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InterviewQueueEntry" (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId" TEXT UNIQUE NOT NULL,
    status        TEXT NOT NULL DEFAULT 'queued',
    position      INTEGER,
    scheduledAt   TIMESTAMPTZ,
    joinedAt      TIMESTAMPTZ,
    startedAt     TIMESTAMPTZ,
    completedAt   TIMESTAMPTZ,
    cancelledAt   TIMESTAMPTZ,
    skippedAt     TIMESTAMPTZ,
    cooldownUntil TIMESTAMPTZ,
    skipCount     INTEGER NOT NULL DEFAULT 0,
    createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "InterviewQueueEntry_candidateId_idx" ON "InterviewQueueEntry"("candidateId");
CREATE INDEX IF NOT EXISTS "InterviewQueueEntry_status_idx" ON "InterviewQueueEntry"(status);
CREATE INDEX IF NOT EXISTS "InterviewQueueEntry_cooldownUntil_idx" ON "InterviewQueueEntry"(cooldownUntil);

-- ── InterviewSession ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InterviewSession" (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId"   TEXT NOT NULL,
    "queueEntryId"  TEXT,
    startedViaQueue BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'active',
    currentPhase    TEXT NOT NULL DEFAULT 'interview',
    interviewData   TEXT,
    startedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completedAt     TIMESTAMPTZ,
    createdAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "InterviewSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InterviewSession_candidateId_idx" ON "InterviewSession"("candidateId");
CREATE INDEX IF NOT EXISTS "InterviewSession_status_idx" ON "InterviewSession"(status);
CREATE INDEX IF NOT EXISTS "InterviewSession_queueEntryId_idx" ON "InterviewSession"("queueEntryId");

-- ── InterviewMessage ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InterviewMessage" (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "interviewSessionId" TEXT NOT NULL,
    role                TEXT NOT NULL,
    content             TEXT NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "InterviewMessage_interviewSessionId_fkey" FOREIGN KEY ("interviewSessionId") REFERENCES "InterviewSession"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InterviewMessage_interviewSessionId_idx" ON "InterviewMessage"("interviewSessionId");
CREATE INDEX IF NOT EXISTS "InterviewMessage_timestamp_idx" ON "InterviewMessage"(timestamp);

-- ── InterviewStateSnapshot ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "InterviewStateSnapshot" (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId"       TEXT NOT NULL,
    "queueEntryId"      TEXT NOT NULL,
    questionCount       INTEGER NOT NULL DEFAULT 0,
    conversationHistory TEXT NOT NULL,
    createdAt           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "InterviewStateSnapshot_candidateId_idx" ON "InterviewStateSnapshot"("candidateId");
CREATE INDEX IF NOT EXISTS "InterviewStateSnapshot_queueEntryId_idx" ON "InterviewStateSnapshot"("queueEntryId");

-- ── PhaseHistory ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PhaseHistory" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    phase         TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completedAt   TIMESTAMPTZ,
    createdAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "PhaseHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("candidateId", phase)
);
CREATE INDEX IF NOT EXISTS "PhaseHistory_candidateId_idx" ON "PhaseHistory"("candidateId");
CREATE INDEX IF NOT EXISTS "PhaseHistory_phase_idx" ON "PhaseHistory"(phase);

-- ── EvaluationCriteria ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EvaluationCriteria" (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    weight      INTEGER NOT NULL DEFAULT 1,
    "order"     INTEGER NOT NULL DEFAULT 0,
    isActive    BOOLEAN NOT NULL DEFAULT TRUE,
    createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EvaluationCriteria_isActive_idx" ON "EvaluationCriteria"(isActive);

-- ── SystemGuidelines ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SystemGuidelines" (
    id        TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    key       TEXT UNIQUE NOT NULL,
    content   TEXT NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SystemGuidelines_key_idx" ON "SystemGuidelines"(key);

-- ── AntiCheatEvent ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AntiCheatEvent" (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    "interviewId" TEXT,
    eventType   TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'warning',
    message     TEXT,
    metadata    TEXT,
    createdAt   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AntiCheatEvent_candidateId_idx" ON "AntiCheatEvent"("candidateId");
CREATE INDEX IF NOT EXISTS "AntiCheatEvent_interviewId_idx" ON "AntiCheatEvent"("interviewId");
CREATE INDEX IF NOT EXISTS "AntiCheatEvent_eventType_idx" ON "AntiCheatEvent"(eventType);
CREATE INDEX IF NOT EXISTS "AntiCheatEvent_createdAt_idx" ON "AntiCheatEvent"(createdAt);

-- ── Resume ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Resume" (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    "candidateId" TEXT NOT NULL,
    fileName     TEXT NOT NULL,
    fileType     TEXT NOT NULL,
    rawText      TEXT,
    parsedData   TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    createdAt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Resume_candidateId_idx" ON "Resume"("candidateId");
CREATE INDEX IF NOT EXISTS "Resume_status_idx" ON "Resume"(status);

-- ── Settings (SQLAlchemy) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS "settings" (
    id          SERIAL PRIMARY KEY,
    key         TEXT UNIQUE NOT NULL,
    value       TEXT,
    description TEXT,
    category    TEXT NOT NULL DEFAULT 'general',
    created_at  TEXT NOT NULL DEFAULT NOW()::TEXT,
    updated_at  TEXT NOT NULL DEFAULT NOW()::TEXT
);
CREATE INDEX IF NOT EXISTS "settings_key_idx" ON settings(key);
CREATE INDEX IF NOT EXISTS "settings_category_idx" ON settings(category);

COMMIT;
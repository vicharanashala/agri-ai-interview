"use client";

import { useEffect, useRef } from "react";
import styles from "./LiveTab.module.css";

interface Message {
  role: "assistant" | "user" | string;
  content: string;
  timestamp: string;
}

export interface LiveInterview {
  id: string;
  candidateId: string;
  candidateName: string;
  startedAt: string;
  messagesCount: number;
  messages: Message[];
  currentPhase: string;
}

interface LiveTabProps {
  interviews: LiveInterview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  signing: "Signing",
  interview: "Interview",
  summary: "Summary",
  offer: "Offer",
  joining: "Joining",
};

export default function LiveTab({ interviews, selectedId, onSelect }: LiveTabProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesCountRef = useRef<number>(0);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (selectedId) {
      const interview = interviews.find((i) => i.id === selectedId);
      if (interview && interview.messages.length > prevMessagesCountRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      prevMessagesCountRef.current = interview?.messages.length ?? 0;
    }
  }, [interviews, selectedId]);

  const selected = interviews.find((i) => i.id === selectedId);

  // Auto-select first interview when there's exactly one
  useEffect(() => {
    if (!selectedId && interviews.length === 1) {
      onSelect(interviews[0].id);
    }
  }, [interviews, selectedId, onSelect]);

  if (interviews.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🎙️</div>
        <h3>No Live Interviews</h3>
        <p>Active interview sessions will appear here in real time</p>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* ─── Left: interview list ─── */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.liveCount}>
            <span className={styles.pulseDot}></span>
            {interviews.length} live
          </span>
        </div>
        <div className={styles.interviewList}>
          {interviews.map((iv) => (
            <button
              key={iv.id}
              className={`${styles.interviewCard} ${selectedId === iv.id ? styles.selected : ""}`}
              onClick={() => onSelect(iv.id)}
            >
              <div className={styles.cardTop}>
                <span className={styles.candidateName}>{iv.candidateName}</span>
                <span className={styles.msgCount}>{iv.messagesCount} msgs</span>
              </div>
              <div className={styles.cardPhase}>
                {PHASE_LABELS[iv.currentPhase] || iv.currentPhase}
              </div>
              {iv.messages.length > 0 && (
                <div className={styles.cardLastMsg}>
                  <span className={styles.lastMsgRole}>
                    {iv.messages[iv.messages.length - 1].role === "assistant" ? "AI" : " Candidate"}
                  </span>
                  {iv.messages[iv.messages.length - 1].content.substring(0, 60)}
                  {iv.messages[iv.messages.length - 1].content.length > 60 ? "…" : ""}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Right: chat panel ─── */}
      <div className={styles.chatArea}>
        {!selected ? (
          <div className={styles.chatPlaceholder}>
            <p>Select an interview to view the live chat</p>
          </div>
        ) : (
          <>
            <div className={styles.chatHeader}>
              <div>
                <span className={styles.chatCandidateName}>{selected.candidateName}</span>
                <span className={styles.chatPhaseTag}>{PHASE_LABELS[selected.currentPhase] || selected.currentPhase}</span>
              </div>
              <div className={styles.chatMeta}>
                <span className={styles.liveBadge}>
                  <span className={styles.pulseDot}></span>LIVE
                </span>
                <span className={styles.msgCountBadge}>{selected.messagesCount} messages</span>
              </div>
            </div>

            <div className={styles.chatMessages}>
              {selected.messages.length === 0 && (
                <div className={styles.noMessages}>Interview started — waiting for messages…</div>
              )}
              {selected.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`${styles.message} ${msg.role === "assistant" ? styles.aiMsg : styles.userMsg}`}
                >
                  <span className={styles.msgRoleTag}>{msg.role === "assistant" ? "AI" : "Candidate"}</span>
                  <p className={styles.msgContent}>{msg.content}</p>
                  <span className={styles.msgTime}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
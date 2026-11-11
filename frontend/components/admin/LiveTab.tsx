"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LiveTab.module.css";
import IndiaCoverageMap from "./IndiaCoverageMap";

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
  candidateState?: string;
  candidateDistrict?: string;
}

interface LiveTabProps {
  interviews: LiveInterview[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  adminToken?: string | null;
  adminApiBase?: string;
  onNavigateToCandidates?: (stateName?: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  signing: "Signing",
  interview: "Interview",
  summary: "Summary",
  offer: "Offer",
  joining: "Joining",
};

export default function LiveTab({
  interviews,
  selectedId,
  onSelect,
  adminToken,
  adminApiBase,
  onNavigateToCandidates,
}: LiveTabProps) {
  const [activeView, setActiveView] = useState<"chats" | "map">("chats");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesCountRef = useRef<number>(0);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (selectedId && activeView === "chats") {
      const interview = interviews.find((i) => i.id === selectedId);
      if (interview && interview.messages.length > prevMessagesCountRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      prevMessagesCountRef.current = interview?.messages.length ?? 0;
    }
  }, [interviews, selectedId, activeView]);

  const selected = interviews.find((i) => i.id === selectedId);

  // Auto-select first interview when there's exactly one and none selected
  useEffect(() => {
    if (!selectedId && interviews.length === 1) {
      onSelect(interviews[0].id);
    }
  }, [interviews, selectedId, onSelect]);

  return (
    <div className={styles.liveContainer}>
      {/* ─── Top View Switcher Toolbar ─── */}
      <div className={styles.toolbar}>
        <div className={styles.viewButtonGroup}>
          <button
            className={`${styles.viewBtn} ${activeView === "chats" ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView("chats")}
            type="button"
          >
            <span>💬</span>
            <span>Live Chats</span>
            {interviews.length > 0 ? (
              <span className={styles.btnBadgeLive}>
                <span className={styles.pulseDot}></span>
                {interviews.length} LIVE
              </span>
            ) : (
              <span style={{ opacity: 0.65, fontSize: "11px" }}>(0)</span>
            )}
          </button>

          <button
            className={`${styles.viewBtn} ${activeView === "map" ? styles.viewBtnActive : ""}`}
            onClick={() => setActiveView("map")}
            type="button"
          >
            <span>🗺️</span>
            <span>India Coverage Map</span>
            <span className={styles.btnBadgeOsm}>OpenStreetMap</span>
          </button>
        </div>

        <div className={styles.toolbarMeta}>
          {interviews.length > 0 ? (
            <div className={styles.liveIndicator}>
              <span className={styles.pulseDot}></span>
              <span>{interviews.length} active candidate{interviews.length === 1 ? "" : "s"} interviewing</span>
            </div>
          ) : (
            <span style={{ fontSize: "12px", color: "#6b7280" }}>
              Active within last 5 minutes (auto-synced)
            </span>
          )}
        </div>
      </div>

      {/* ─── View 1: India Coverage Map (OpenStreetMap) ─── */}
      {activeView === "map" && (
        <IndiaCoverageMap
          adminToken={adminToken}
          adminApiBase={adminApiBase}
          interviews={interviews}
          onNavigateToCandidates={onNavigateToCandidates}
        />
      )}

      {/* ─── View 2: Live Chats ─── */}
      {activeView === "chats" && (
        <>
          {interviews.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🎙️</div>
              <h3>No Live Interviews Currently</h3>
              <p>
                Candidates actively attending an interview in the last 5 minutes will show up here
                in real time with live message streaming.
              </p>
              <button
                className={styles.emptyActionBtn}
                onClick={() => setActiveView("map")}
                type="button"
              >
                🗺️ Explore India Coverage Map →
              </button>
            </div>
          ) : (
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
                      {iv.candidateState && (
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "4px" }}>
                          📍 {iv.candidateDistrict ? `${iv.candidateDistrict}, ` : ""}{iv.candidateState}
                        </div>
                      )}
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
                        <span className={styles.chatPhaseTag}>
                          {PHASE_LABELS[selected.currentPhase] || selected.currentPhase}
                        </span>
                        {selected.candidateState && (
                          <span style={{ marginLeft: "8px", fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                            📍 {selected.candidateDistrict ? `${selected.candidateDistrict}, ` : ""}{selected.candidateState}
                          </span>
                        )}
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
                          <span className={styles.msgRoleTag}>
                            {msg.role === "assistant" ? "AI" : "Candidate"}
                          </span>
                          <p className={styles.msgContent}>{msg.content}</p>
                          <span className={styles.msgTime}>
                            {new Date(msg.timestamp).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Kolkata",
                            })}
                          </span>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

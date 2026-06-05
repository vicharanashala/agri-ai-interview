"use client";

import { useState, useEffect } from "react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

interface FAQGroup {
  category: string;
  faqs: FAQ[];
}

const PAGE_SIZE = 5;

export default function FAQPage() {
  const [faqGroups, setFaqGroups] = useState<FAQGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Floating chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch("/api/faq/all")
      .then((r) => r.json())
      .then((data: FAQGroup[]) => {
        setFaqGroups(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Flatten all FAQs with global index for numbering
  const allFaqs: (FAQ & { category: string; globalIndex: number })[] = [];
  let idx = 1;
  faqGroups.forEach((g) => {
    g.faqs.forEach((f) => {
      allFaqs.push({ ...f, category: g.category, globalIndex: idx++ });
    });
  });

  // Filter by category
  const filtered = selectedCategory === "All"
    ? allFaqs
    : allFaqs.filter((f) => f.category === selectedCategory);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedFaqs = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when category changes
  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [selectedCategory]);

  const categories = ["All", ...faqGroups.map((g) => g.category)];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>💬</span>
          <div>
            <h1 style={styles.headerTitle}>FAQ & Help</h1>
            <p style={styles.headerSub}>
              {loading ? "Loading..." : `${filtered.length} questions`}
            </p>
          </div>
        </div>
        <a href="/" style={styles.backLink}>← Back to Home</a>
      </div>

      {/* Category Filter */}
      {!loading && (
        <div style={styles.filterBar}>
          <label style={styles.filterLabel}>Filter by:</label>
          <select
            style={styles.filterSelect}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      )}

      {/* FAQ List */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.loadingState}>
            <div style={styles.spinner} />
            <p>Loading FAQs...</p>
          </div>
        ) : paginatedFaqs.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No FAQs found in this category.</p>
          </div>
        ) : (
          <>
            <div style={styles.faqList}>
              {paginatedFaqs.map((faq) => (
                <div
                  key={faq.id}
                  style={{
                    ...styles.faqCard,
                    ...(expandedId === faq.id ? styles.faqCardExpanded : {}),
                  }}
                  onClick={() =>
                    setExpandedId(expandedId === faq.id ? null : faq.id)
                  }
                >
                  <div style={styles.faqCardTop}>
                    <span style={styles.faqNumber}>{faq.globalIndex}</span>
                    <p style={styles.faqQuestion}>{faq.question}</p>
                    <span style={styles.faqChevron}>
                      {expandedId === faq.id ? "▲" : "▼"}
                    </span>
                  </div>
                  {expandedId === faq.id && (
                    <p style={styles.faqAnswer}>{faq.answer}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={styles.pagination}>
                <button
                  style={{
                    ...styles.pageBtn,
                    ...(currentPage === 1 ? styles.pageBtnDisabled : {}),
                  }}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                <span style={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  style={{
                    ...styles.pageBtn,
                    ...(currentPage === totalPages ? styles.pageBtnDisabled : {}),
                  }}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Chat Widget */}
      <div style={styles.chatContainer}>
        {chatOpen ? (
          <div style={styles.chatWindow}>
            <div style={styles.chatHeader}>
              <span style={styles.chatHeaderTitle}>FAQ Assistant</span>
              <button
                style={styles.chatClose}
                onClick={() => setChatOpen(false)}
              >
                ✕
              </button>
            </div>
            <div style={styles.chatBody}>
              {chatMessages.length === 0 && (
                <p style={styles.chatEmpty}>
                  Ask me anything about the internship, interview process, or
                  your application.
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.chatBubble,
                    ...(msg.role === "user"
                      ? styles.chatBubbleUser
                      : styles.chatBubbleBot),
                  }}
                >
                  {msg.text}
                </div>
              ))}
              {chatLoading && (
                <div style={styles.chatBubbleBot}>Typing...</div>
              )}
            </div>
            <form
              style={styles.chatForm}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chatInput.trim() || chatLoading) return;

                const userText = chatInput.trim();
                setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
                setChatInput("");
                setChatLoading(true);

                try {
                  const res = await fetch("/api/faq/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: userText }),
                  });
                  const data = await res.json();
                  setChatMessages((prev) => [
                    ...prev,
                    { role: "bot", text: data.answer || "Sorry, I couldn't find an answer." },
                  ]);
                } catch {
                  setChatMessages((prev) => [
                    ...prev,
                    { role: "bot", text: "Something went wrong. Please try again." },
                  ]);
                }
                setChatLoading(false);
              }}
            >
              <input
                style={styles.chatInput}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a question..."
                disabled={chatLoading}
              />
              <button type="submit" style={styles.chatSend} disabled={chatLoading}>
                →
              </button>
            </form>
          </div>
        ) : (
          <button
            style={styles.chatBubbleBtn}
            onClick={() => setChatOpen(true)}
            aria-label="Open FAQ chat"
          >
            <span style={{ fontSize: "22px" }}>💬</span>
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    background: "white",
    padding: "20px 40px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  headerIcon: {
    fontSize: "28px",
  },
  headerTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 700,
    color: "#1a1a2e",
  },
  headerSub: {
    margin: "2px 0 0",
    fontSize: "13px",
    color: "#6b7280",
  },
  backLink: {
    fontSize: "14px",
    color: "#08CB00",
    textDecoration: "none",
    fontWeight: 500,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px 40px",
    background: "white",
    borderBottom: "1px solid #e5e7eb",
  },
  filterLabel: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
  },
  filterSelect: {
    padding: "8px 14px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#374151",
    background: "white",
    cursor: "pointer",
    outline: "none",
  },
  content: {
    maxWidth: "860px",
    margin: "0 auto",
    padding: "32px 24px 80px",
  },
  loadingState: {
    textAlign: "center",
    padding: "60px 0",
    color: "#9ca3af",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 0",
    color: "#9ca3af",
    fontSize: "15px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderWidth: "3px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderTopColor: "#08CB00",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto 16px",
  },
  faqList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  faqCard: {
    background: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: "12px",
    padding: "18px 20px",
    cursor: "pointer",
    transition: "box-shadow 0.15s, border-color 0.15s",
  },
  faqCardExpanded: {
    borderColor: "#08CB00",
    boxShadow: "0 0 0 3px rgba(8, 203, 0, 0.1)",
  },
  faqCardTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
  },
  faqNumber: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#9ca3af",
    minWidth: "28px",
    marginTop: "2px",
  },
  faqQuestion: {
    flex: 1,
    margin: 0,
    fontSize: "15px",
    fontWeight: 600,
    color: "#1a1a2e",
    lineHeight: 1.4,
  },
  faqChevron: {
    fontSize: "11px",
    color: "#9ca3af",
    marginTop: "4px",
  },
  faqAnswer: {
    margin: "12px 0 0",
    fontSize: "14px",
    color: "#4b5563",
    lineHeight: 1.7,
    paddingTop: "12px",
    borderTop: "1px solid #f3f4f6",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    marginTop: "32px",
  },
  pageBtn: {
    padding: "8px 20px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 500,
    color: "#374151",
  },
  pageBtnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  pageInfo: {
    fontSize: "14px",
    color: "#6b7280",
    fontWeight: 500,
  },
  chatContainer: {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: 1000,
  },
  chatWindow: {
    width: "360px",
    height: "480px",
    background: "white",
    borderRadius: "16px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    marginBottom: "12px",
  },
  chatHeader: {
    background: "linear-gradient(135deg, #08CB00, #059669)",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatHeaderTitle: {
    color: "white",
    fontSize: "15px",
    fontWeight: 700,
  },
  chatClose: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    fontSize: "18px",
    cursor: "pointer",
    padding: "0",
    lineHeight: 1,
  },
  chatBody: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    background: "#f9fafb",
  },
  chatEmpty: {
    margin: "auto 0",
    textAlign: "center",
    fontSize: "13px",
    color: "#9ca3af",
    padding: "20px 0",
  },
  chatBubble: {
    maxWidth: "80%",
    padding: "10px 14px",
    fontSize: "13px",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  chatBubbleUser: {
    alignSelf: "flex-end",
    background: "#08CB00",
    color: "white",
    borderRadius: "12px",
    borderTopLeftRadius: "12px",
    borderBottomRightRadius: "4px",
  },
  chatBubbleBot: {
    alignSelf: "flex-start",
    background: "white",
    color: "#374151",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: "12px",
    borderTopRightRadius: "12px",
    borderBottomLeftRadius: "4px",
  },
  chatForm: {
    display: "flex",
    gap: "8px",
    padding: "12px",
    borderTop: "1px solid #e5e7eb",
  },
  chatInput: {
    flex: 1,
    padding: "10px 14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    fontSize: "13px",
    outline: "none",
  },
  chatSend: {
    padding: "10px 16px",
    background: "#08CB00",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 700,
  },
  chatBubbleBtn: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #08CB00, #059669)",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 16px rgba(8, 203, 0, 0.4)",
  },
};

// Spinner animation injected once
if (typeof document !== "undefined" && !document.getElementById("faq-spinner-style")) {
  const s = document.createElement("style");
  s.id = "faq-spinner-style";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}
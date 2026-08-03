"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import styles from "./page.module.css";

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
  const [loggingOut, setLoggingOut] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const router = useRouter();
  const { status } = useSession();
  const isSignedIn = status === "authenticated";

  useEffect(() => {
    fetch("/api/faq/all")
      .then((response) => response.json())
      .then((data: FAQGroup[]) => {
        setFaqGroups(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const allFaqs: (FAQ & { category: string; globalIndex: number })[] = [];
  let idx = 1;
  faqGroups.forEach((group) => {
    group.faqs.forEach((faq) => {
      allFaqs.push({ ...faq, category: group.category, globalIndex: idx++ });
    });
  });

  const filtered =
    selectedCategory === "All"
      ? allFaqs
      : allFaqs.filter((faq) => faq.category === selectedCategory);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedFaqs = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [selectedCategory]);

  const categories = ["All", ...faqGroups.map((group) => group.category)];

  const handleLogout = async () => {
    setLoggingOut(true);

    const redisToken = sessionStorage.getItem("candidate_session_token");
    if (redisToken) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL;
      fetch(`${backendUrl}/api/candidate/session/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}` },
      }).catch(() => {});
    }

    sessionStorage.clear();
    localStorage.clear();
    await signOut({ redirect: false });
    router.push("/login");
  };

  const handleChatSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/faq/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userText }),
      });
      const data = await response.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "bot", text: data.answer || "Sorry, I couldn't find an answer." },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "bot", text: "Something went wrong. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <div className={styles.logoWrapper}>
            <img
          src="/annam-logo.png"
          alt="ANNAM.AI"
          className={styles.logo}
        />
            <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
          </div>
          <div className={styles.headerButtons}>
            {isSignedIn ? (
              <>
                <button onClick={() => router.push("/dashboard")} className={styles.faqHelpBtn}>
                  Dashboard
                </button>
                <button onClick={handleLogout} disabled={loggingOut} className={styles.signOutBtn}>
                  {loggingOut ? "Signing out..." : "Sign Out"}
                </button>
              </>
            ) : (
              <button onClick={() => router.push("/login")} className={styles.faqHelpBtn}>
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>Candidate Help</p>
            <h1 className={styles.title}>FAQ & Help</h1>
            <p className={styles.subtitle}>
              {loading ? "Loading questions..." : `${filtered.length} questions available`}
            </p>
          </div>
          {!loading && (
            <div className={styles.filterGroup}>
              <label htmlFor="category-filter" className={styles.filterLabel}>Filter by</label>
              <select
                id="category-filter"
                className={styles.filterSelect}
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <section className={styles.faqPanel}>
          {loading ? (
            <div className={styles.state}>
              <div className={styles.spinner} />
              <p>Loading FAQs...</p>
            </div>
          ) : paginatedFaqs.length === 0 ? (
            <div className={styles.state}>
              <p>No FAQs found in this category.</p>
            </div>
          ) : (
            <>
              <div className={styles.faqList}>
                {paginatedFaqs.map((faq) => {
                  const isExpanded = expandedId === faq.id;

                  return (
                    <button
                      key={faq.id}
                      type="button"
                      className={`${styles.faqCard} ${isExpanded ? styles.faqCardExpanded : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                      aria-expanded={isExpanded}
                    >
                      <span className={styles.faqTop}>
                        <span className={styles.faqNumber}>{faq.globalIndex}</span>
                        <span className={styles.faqQuestion}>{faq.question}</span>
                        <span className={styles.faqChevron}>{isExpanded ? "Up" : "Down"}</span>
                      </span>
                      {isExpanded && (
                        <span className={styles.faqAnswer}>{faq.answer}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className={styles.pagination}>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </button>
                  <span className={styles.pageInfo}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <div className={styles.chatContainer}>
        {chatOpen ? (
          <div className={styles.chatWindow}>
            <div className={styles.chatHeader}>
              <span className={styles.chatHeaderTitle}>FAQ Assistant</span>
              <button
                type="button"
                className={styles.chatClose}
                onClick={() => setChatOpen(false)}
                aria-label="Close FAQ assistant"
              >
                x
              </button>
            </div>
            <div className={styles.chatBody}>
              {chatMessages.length === 0 && (
                <p className={styles.chatEmpty}>
                  Ask me anything about the internship, interview process, or your application.
                </p>
              )}
              {chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`${styles.chatBubble} ${message.role === "user" ? styles.chatBubbleUser : styles.chatBubbleBot}`}
                >
                  {message.text}
                </div>
              ))}
              {chatLoading && (
                <div className={`${styles.chatBubble} ${styles.chatBubbleBot}`}>Typing...</div>
              )}
            </div>
            <form className={styles.chatForm} onSubmit={handleChatSubmit}>
              <input
                className={styles.chatInput}
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Type a question..."
                disabled={chatLoading}
              />
              <button type="submit" className={styles.chatSend} disabled={chatLoading}>
                Send
              </button>
            </form>
          </div>
        ) : (
          <button
            type="button"
            className={styles.chatBubbleBtn}
            onClick={() => setChatOpen(true)}
            aria-label="Open FAQ chat"
          >
            FAQ
          </button>
        )}
      </div>
    </main>
  );
}

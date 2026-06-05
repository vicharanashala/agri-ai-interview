"use client";

import { useState } from "react";
import styles from "./login.module.css";
import { useRouter } from "next/navigation";

// Points to the Next.js rewrite proxy so the browser talks to a single origin.
// In Docker, this resolves to the Next.js server; locally it falls back to the
// direct backend URL for development outside Docker.
const ADMIN_API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Credentials are sent to backend; on success the backend sets the
      // httpOnly admin_session cookie (scoped to /admin).  Nothing is stored
      // in localStorage — the cookie handles everything.
      const response = await fetch(
        `${ADMIN_API_BASE}/api/admin/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // Store the admin token in localStorage so the dashboard can send it
      // as X-Admin-Token header. This works across all deployments (local,
      // same-origin, or cross-origin) without needing cookie domain tricks.
      if (data.token) {
        localStorage.setItem("admin_token", data.token);
      }

      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      {/* Top bar with logo */}
      <header className={styles.topBar}>
        <img
          src="/login/annam-logo-white.png"
          alt="ANNAM.AI"
          className={styles.logo}
        />
        <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
      </header>

      {/* Hero heading */}
      <div className={styles.hero}>
        <h1 className={styles.heading}>Admin Portal — AI Interview Platform</h1>
      </div>

      {/* Login form */}
      <div className={styles.loginBox}>
        <h2 className={styles.title}>Sign In</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@annam.com"
              required
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.button}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.demoNote}>
            Demo credentials: admin@annam.com / admin123
          </p>
        </div>
      </div>
    </main>
  );
}
"use client";

import { useState } from "react";
import styles from "./login.module.css";
import { useRouter } from "next/navigation";

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
      const response = await fetch("http://localhost:8000/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // Store token and admin data
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_data", JSON.stringify({ ...data.admin, password }));

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
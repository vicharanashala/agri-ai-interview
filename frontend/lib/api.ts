// Single source of truth for backend API URL.
// Set NEXT_PUBLIC_API_URL in .env (e.g. http://localhost:8003 for local, https://api.example.com for production).
// All frontend API routes and components must use this — no hardcoded localhost/port fallbacks.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
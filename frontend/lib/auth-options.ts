import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'

const BACKEND_URL = process.env.BACKEND_URL ?? ''

async function getBackendCandidateByEmail(email: string) {
  const res = await fetch(
    `${BACKEND_URL}/api/candidate?email=${encodeURIComponent(email)}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}

export const authOptions: NextAuthOptions = {
  trustHost: true,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const res = await fetch(`${BACKEND_URL}/api/candidate/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })

        if (!res.ok) return null
        const user = await res.json()
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) (session.user as { id?: string }).id = token.sub
        if (token.email) (session.user as { email?: string }).email = token.email as string
        if (token.candidateId)
          (session.user as { candidateId?: string }).candidateId = token.candidateId as string
      }
      return session
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        if (account?.provider === 'credentials') {
          token.sub = user.id
          token.email = user.email
          const cand = await getBackendCandidateByEmail(user.email!)
          if (cand?.id) token.candidateId = cand.id
        }
        if (account?.provider === 'google') {
          const email = user.email!
          const name = user.name ?? email.split('@')[0]
          // Tell NextAuth to use the Google account; no DB ops needed here
          // We don't create users/candidates at login — that happens on first
          // Next.js API call to /api/candidate (onboarding form submit).
          // The candidate_id will be fetched on the session callback on the
          // Next.js side via the existing /api/candidate?email=... endpoint.
          token.sub = user.id ?? `google-${Buffer.from(email).toString('base64').slice(0, 12)}`
          token.email = email
          token.name = name
          const cand = await getBackendCandidateByEmail(email)
          if (cand?.id) token.candidateId = cand.id
        }
      }
      return token
    },
  },
  pages: { signIn: '/login', error: '/login' },
}
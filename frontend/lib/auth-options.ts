import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
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

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: false,
  // Firebase Hosting → Cloud Run rewrites the Host header before forwarding,
  // so NextAuth would otherwise reject requests as "untrusted host" and the
  // session cookie would never round-trip on the custom domain.
  // `trustHost` is a runtime option supported by next-auth v4.21+ but is not
  // declared in the v4.24.14 types, hence the cast at the bottom of this file.
  trustHost: true,
  providers: [
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
      }
      return token
    },
  },
  pages: { signIn: '/login', error: '/login' },
  cookies: {
    sessionToken: {
      name: '__session',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
} as NextAuthOptions

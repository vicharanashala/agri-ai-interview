import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
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
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Look up user in Prisma/SQLite database
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.password) {
          // No user found or user has no password set
          return null
        }

        // Compare bcrypt hash
        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) {
          ;(session.user as { id?: string }).id = token.sub
        }
        if (token.email) {
          ;(session.user as { email?: string }).email = token.email as string
        }
      }
      return session
    },
    async jwt({ token, user, account, trigger }) {
      // First-time sign-in
      if (user) {
        // Credentials: authorize() returned our DB user object with our id
        if (account?.provider === 'credentials') {
          token.sub = user.id
          token.email = user.email
        }
        // Google OAuth: need to create/find our DB user and use OUR id
        if (account?.provider === 'google') {
          const email = user.email!
          const name = user.name ?? email.split('@')[0]
          let dbUser = await prisma.user.findUnique({ where: { email } })
          if (!dbUser) {
            dbUser = await prisma.user.create({
              data: { email, name },
            })
          }
          // Immediately create Candidate record so user appears in admin dashboard
          try {
            await prisma.candidate.upsert({
              where: { userId: dbUser.id },
              update: {},
              create: { userId: dbUser.id, currentPhase: 'onboarding' },
            })
          } catch (err) {
            // Non-fatal: auth succeeds even if candidate record creation fails
            console.error('[next-auth] Failed to create candidate record:', err)
          }
          token.sub = dbUser.id
          token.email = email
        }
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
}
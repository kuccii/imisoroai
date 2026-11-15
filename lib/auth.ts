import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const trustedOrigins = [
  ...(process.env.NODE_ENV === 'development'
    ? [
        'http://localhost:3000',
        ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
        ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
        ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
        ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
      ]
    : []),
  ...(process.env.NODE_ENV === 'production'
    ? [
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
          : []),
      ]
    : []),
]

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins,
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          // Required for the v0 cross-site preview iframe to retain the session cookie.
          defaultCookieAttributes: { sameSite: 'none' as const, secure: true },
        },
      }
    : {}),
})

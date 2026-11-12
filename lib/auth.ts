import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const trustedOrigins = [
  'http://localhost:3000',
  ...['V0_RUNTIME_URL', 'V0_DEV_APP_URL', 'V0_BUILD_URL', 'V0_SANDBOX_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']
    .map((key) => process.env[key])
    .filter((value): value is string => Boolean(value))
    .map((value) => value.startsWith('http') ? value : `https://${value}`),
]

// Cross-site cookies are only needed inside the v0 preview iframe. On plain
// http://localhost they break sign-in, so keep the safer default there.
const crossSiteCookies = process.env.NODE_ENV === 'development' && Boolean(process.env.V0_RUNTIME_URL)

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins,
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(crossSiteCookies ? {
    advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } },
  } : {}),
})

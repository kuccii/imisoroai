'use client'

import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, signUp } from '@/lib/auth-client'

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'sign-up') {
        await signUp.email({ email, password, name })
      } else {
        await signIn.email({ email, password })
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Imisoro AI</h1>
            <p className="text-slate-400">Tax Compliance Assistant for Rwandan SMEs</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'sign-up' && (
              <div>
                <label htmlFor="business-name" className="block text-sm font-medium text-slate-300 mb-2">Business Name</label>
                <input
                  type="text"
                  id="business-name"
                  placeholder="Your business name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
              />
            </div>

            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">{error}</div>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5"
            >
              {loading ? 'Processing...' : mode === 'sign-up' ? 'Create Account' : 'Sign In'}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">or</span>
              </div>
            </div>

            <div className="text-center text-sm text-slate-400">
              {mode === 'sign-up' ? (
                <>
                  Already have an account?{' '}
                  <a href="/login" className="text-blue-400 hover:text-blue-300 font-semibold">
                    Sign in
                  </a>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <a href="/signup" className="text-blue-400 hover:text-blue-300 font-semibold">
                    Create one
                  </a>
                </>
              )}
            </div>
          </form>

          <div className="mt-8 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-xs text-slate-400">
              <strong>Demo:</strong> Use any email/password to create an account. Your data is securely stored in the database.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

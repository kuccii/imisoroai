'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth-client'

interface AuthFormProps { mode: 'sign-in' | 'sign-up' }

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = isSignUp
        ? await signUp.email({ email: email.trim(), password, name: name.trim() })
        : await signIn.email({ email: email.trim(), password })
      if (result.error) {
        setError('We could not authenticate you. Check your details and try again.')
        return
      }
      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('We could not authenticate you. Check your details and try again.')
    } finally { setLoading(false) }
  }

  return <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[.9fr_1.1fr]">
    <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex"><Link href="/" className="flex items-center gap-3 text-sm font-semibold"><span className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/15"><ShieldCheck className="size-5" /></span>Imisoro AI</Link><div className="max-w-md"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">Tax clarity, made simple</p><h1 className="mt-5 text-4xl font-semibold leading-tight">A calmer way to stay ready for Rwanda tax filings.</h1><p className="mt-5 text-sm leading-6 text-primary-foreground/75">Review EBM evidence, understand expense support and keep your VAT records organized in one focused workspace.</p><div className="mt-8 flex flex-col gap-3 text-sm text-primary-foreground/85"><span><Check className="mr-2 inline size-4" /> Built for VAT-registered SMEs</span><span><Check className="mr-2 inline size-4" /> English, Kinyarwanda and French</span><span><Check className="mr-2 inline size-4" /> Human review stays in control</span></div></div><p className="text-xs text-primary-foreground/60">Your records belong to your business.</p></section>
    <section className="flex items-center justify-center p-5 md:p-10"><div className="w-full max-w-md"><Link href="/" className="mb-10 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to Imisoro AI</Link><div className="mb-8"><div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-accent text-primary lg:hidden"><ShieldCheck className="size-5" /></div><h2 className="text-3xl font-semibold tracking-tight">{isSignUp ? 'Create your workspace' : 'Welcome back'}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isSignUp ? 'Start organizing your tax compliance in minutes.' : 'Sign in to continue to your secure tax workspace.'}</p></div><form onSubmit={handleSubmit} className="flex flex-col gap-5">{isSignUp && <label className="flex flex-col gap-2 text-sm font-medium">Business or full name<input id="business-name" value={name} onChange={event => setName(event.target.value)} required minLength={2} autoComplete="name" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. Amahoro Trading Ltd" /></label>}<label className="flex flex-col gap-2 text-sm font-medium">Email address<input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="you@business.com" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} autoComplete={isSignUp ? 'new-password' : 'current-password'} className="h-11 rounded-lg border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring" placeholder="At least 8 characters" /></label>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}<Button type="submit" disabled={loading} className="h-11 w-full">{loading ? 'Securing your workspace…' : isSignUp ? 'Create workspace' : 'Sign in'}</Button></form><p className="mt-8 text-center text-sm text-muted-foreground">{isSignUp ? 'Already have an account?' : 'New to Imisoro AI?'} <Link href={isSignUp ? '/login' : '/signup'} className="font-semibold text-primary hover:underline">{isSignUp ? 'Sign in' : 'Create an account'}</Link></p><p className="mt-8 text-center text-xs leading-5 text-muted-foreground">By continuing, you agree to use Imisoro AI as a compliance support tool and verify filings with your accountant or RRA guidance.</p></div></section>
  </main>
}

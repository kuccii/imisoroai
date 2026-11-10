'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Check, LockKeyhole, ShieldCheck } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth-client'

interface AuthFormProps { mode: 'sign-in' | 'sign-up' }

export function AuthForm({ mode }: AuthFormProps) {
  const isSignUp = mode === 'sign-up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const result = isSignUp ? await signUp.email({ email: email.trim(), password, name: name.trim() }) : await signIn.email({ email: email.trim(), password })
      if (result.error) { setError('We could not authenticate you. Check your details and try again.'); return }
      window.location.assign('/dashboard')
    } catch { setError('We could not authenticate you. Check your details and try again.') } finally { setLoading(false) }
  }

  return <main className="grid min-h-screen bg-[#f4f7f3] text-[#10251f] lg:grid-cols-[0.92fr_1.08fr]">
    <section className="relative hidden overflow-hidden bg-[#0f5c49] p-10 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-28 top-16 size-80 rounded-full bg-[#4fc39a]/20 blur-3xl" /><Link href="/" className="relative flex items-center gap-3 text-sm font-bold"><span className="flex size-10 items-center justify-center rounded-[14px] bg-white/15"><ShieldCheck className="size-5" /></span>Imisoro <span className="text-[#9ee5c7]">AI</span></Link><div className="relative max-w-md"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Rwanda tax operations</p><h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-[-0.05em]">A calmer month-end starts with better evidence.</h1><p className="mt-6 text-sm leading-7 text-white/70">Capture EBM documents, review VAT support, and keep a defensible source trail for your business or accountant.</p><div className="mt-9 space-y-4 text-sm text-white/80"><span className="block"><Check className="mr-3 inline size-4 text-[#9ee5c7]" />Original documents stay private</span><span className="block"><Check className="mr-3 inline size-4 text-[#9ee5c7]" />AI flags uncertainty for human review</span><span className="block"><Check className="mr-3 inline size-4 text-[#9ee5c7]" />Exports built for your monthly close</span></div></div><p className="relative flex items-center gap-2 text-xs text-white/50"><LockKeyhole className="size-3.5" /> Your records belong to your business.</p></section>
    <section className="flex items-center justify-center px-5 py-10 md:px-12"><div className="w-full max-w-md"><Link href="/" className="mb-14 inline-flex items-center gap-2 text-xs font-bold text-[#678078] transition hover:text-[#10251f]"><ArrowLeft className="size-4" /> Back to Imisoro AI</Link><div className="mb-8"><div className="mb-5 flex size-11 items-center justify-center rounded-[14px] bg-[#dff3e9] text-[#0f8062] lg:hidden"><ShieldCheck className="size-5" /></div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f8062]">{isSignUp ? 'Get started' : 'Secure workspace'}</p><h2 className="mt-3 text-3xl font-bold tracking-[-0.04em]">{isSignUp ? 'Create your workspace' : 'Welcome back'}</h2><p className="mt-3 text-sm leading-6 text-[#678078]">{isSignUp ? 'Start building a reliable invoice evidence trail for your business.' : 'Sign in to continue managing your tax evidence and monthly close.'}</p></div><form onSubmit={handleSubmit} className="flex flex-col gap-5">{isSignUp && <label className="flex flex-col gap-2 text-sm font-bold">Business or full name<input id="business-name" value={name} onChange={event => setName(event.target.value)} required minLength={2} autoComplete="name" className="h-12 rounded-xl border border-[#c8ddd2] bg-white px-4 font-normal outline-none transition focus:border-[#0f8062] focus:ring-4 focus:ring-[#0f8062]/10" placeholder="e.g. Amahoro Trading Ltd" /></label>}<label className="flex flex-col gap-2 text-sm font-bold">Email address<input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" className="h-12 rounded-xl border border-[#c8ddd2] bg-white px-4 font-normal outline-none transition focus:border-[#0f8062] focus:ring-4 focus:ring-[#0f8062]/10" placeholder="you@business.com" /></label><label className="flex flex-col gap-2 text-sm font-bold">Password<input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} autoComplete={isSignUp ? 'new-password' : 'current-password'} className="h-12 rounded-xl border border-[#c8ddd2] bg-white px-4 font-normal outline-none transition focus:border-[#0f8062] focus:ring-4 focus:ring-[#0f8062]/10" placeholder="At least 8 characters" /></label>{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}<button disabled={loading} className="h-12 rounded-xl bg-[#0f5c49] text-sm font-bold text-white shadow-lg shadow-[#0f5c49]/15 transition hover:bg-[#0a493a] disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Please wait…' : isSignUp ? 'Create workspace' : 'Sign in'}</button></form><p className="mt-7 text-center text-sm text-[#678078]">{isSignUp ? 'Already have an account?' : 'New to Imisoro AI?'} <Link href={isSignUp ? '/login' : '/signup'} className="font-bold text-[#0f8062] hover:underline">{isSignUp ? 'Sign in' : 'Create a workspace'}</Link></p><p className="mt-8 text-center text-[11px] leading-5 text-[#91a69d]">By continuing, you agree to use Imisoro as a review and record-keeping workspace. Always verify filings with RRA guidance or your accountant.</p></div></section>
  </main>
}

import express from 'express'
import cors from 'cors'
import { z } from 'zod'
const app = express(); app.use(cors()); app.use(express.json())
const signup = z.object({ email: z.string().email(), password: z.string().min(8), role: z.enum(['owner','accountant']).default('owner') })
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'imisoro-ai' }))
app.post('/api/auth/signup', (req, res) => { const parsed = signup.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Invalid signup data', details: parsed.error.flatten() }); res.status(201).json({ user: { email: parsed.data.email, role: parsed.data.role }, token: 'replace-with-jwt' }) })
app.post('/api/auth/login', (_req, res) => res.json({ token: 'replace-with-jwt', user: { email: 'demo@kivu.rw', role: 'owner' } }))
app.get('/api/invoices', (_req, res) => res.json({ data: [], meta: { total: 0 } }))
app.get('/api/deadlines', (_req, res) => res.json({ data: [] }))
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error('[v0] api error', err); res.status(500).json({ error: 'Internal server error' }) })
app.listen(process.env.PORT || 4000, () => console.log('[v0] Imisoro API listening on port 4000'))

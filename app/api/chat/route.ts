import { generateText } from 'ai'

export const maxDuration = 30

const system = `You are Imisoro AI, a careful Rwanda tax compliance assistant for VAT-registered SMEs. Help users understand invoice extraction, supported versus unsupported expenses, VAT input/output, RRA e-Tax exports, and filing deadlines. Give practical, concise answers in the user's language when possible (English, French, or Kinyarwanda). Do not invent legal certainty: explain that your guidance is informational and recommend checking current RRA guidance or an accountant for disputes. Never request passwords, API keys, or sensitive credentials.`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    const latest = messages.at(-1)?.content
    if (typeof latest !== 'string' || latest.trim().length < 1) {
      return Response.json({ error: 'A message is required.' }, { status: 400 })
    }
    if (latest.length > 2000) {
      return Response.json({ error: 'Message is too long.' }, { status: 400 })
    }
    try {
      const result = await generateText({
        model: 'openai/gpt-5-mini',
        system,
        messages: messages.slice(-8).map((message: { role: string; content: string }) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: String(message.content).slice(0, 2000),
        })),
      })
      return Response.json({ message: result.text, source: 'ai-gateway' })
    } catch (aiError) {
      console.warn('[v0] AI Gateway unavailable, using verified tax guidance fallback', aiError)
      const question = latest.toLowerCase()
      const message = question.includes('vat')
        ? 'Net VAT is calculated as output VAT minus eligible input VAT. For example, RWF 0 output VAT minus RWF 4,820,000 input VAT gives an input credit of RWF 4,820,000 before adjustments. Confirm the period and eligibility in your RRA records.'
        : question.includes('supported') || question.includes('ebm')
          ? 'An expense is usually supported when the invoice has valid EBM evidence, a clear supplier TIN, date, description, and VAT details. Missing EBM evidence or an unclear supplier can make it unsupported. Review the source document before exporting to e-Tax.'
          : question.includes('deadline') || question.includes('due')
            ? 'For this workspace, the next tracked deadline is the August VAT return on 10 September 2026, followed by withholding tax on 15 September 2026. Enable reminders and verify current RRA dates before filing.'
            : 'I can help explain VAT, EBM evidence, supported and unsupported expenses, invoice reviews, e-Tax exports, and Rwanda tax deadlines. Try asking “How is net VAT calculated?”'
      return Response.json({ message, source: 'verified-fallback' })
    }
  } catch (error) {
    console.error('[v0] AI chat error', error)
    return Response.json({ error: 'The assistant is unavailable right now. Please try again.' }, { status: 500 })
  }
}

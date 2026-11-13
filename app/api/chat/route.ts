// app/api/chat/route.ts
import { convertToModelMessages, streamText, type UIMessage } from 'ai'
import { google } from '@ai-sdk/google'

export const maxDuration = 30

// Calls Gemini directly with your own key (GOOGLE_GENERATIVE_AI_API_KEY in .env.local),
// so it doesn't depend on Vercel AI Gateway credentials.
// Swap the model ID for whichever Gemini model your key has access to.
const MODEL = google('gemini-3.5-flash')
const MAX_MESSAGES = 8
const MAX_TEXT_LENGTH = 2000

const system = `You are Imisoro AI, a careful Rwanda tax compliance assistant for VAT-registered SMEs. Help users understand invoice extraction, supported versus unsupported expenses, VAT input/output, RRA e-Tax exports, and filing deadlines.

Rules:
- Give practical, concise answers in the user's language when possible (English, French, or Kinyarwanda).
- Format answers in Markdown: short paragraphs, bullet lists, and bold for key terms. Keep it scannable.
- Your guidance is informational. Do not invent legal certainty; for disputes or edge cases, recommend checking current RRA guidance or an accountant.
- Do not state specific tax rates, deadlines, thresholds, or figures unless the user supplied them or you are confident they are current. If unsure, say so and point to RRA.
- Never make up data about the user's business (invoices, balances, filing dates). You do not have access to their records in this chat.
- Never request passwords, API keys, or other sensitive credentials.`

function textOf(message: UIMessage): string {
  return message.parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('')
}

export async function POST(request: Request) {
  let body: { messages?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: 'A message is required.' }, { status: 400 })
  }

  // Keep only well-formed user/assistant text turns, then trim to recent history
  const cleaned = (body.messages as UIMessage[])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && Array.isArray(m.parts))
    .map(m => ({ ...m, parts: [{ type: 'text' as const, text: textOf(m).trim() }] }))
    .filter(m => m.parts[0].text.length > 0)

  const recent = cleaned.slice(-MAX_MESSAGES)
  while (recent.length && recent[0].role !== 'user') recent.shift()

  const latest = recent.at(-1)
  if (!latest || latest.role !== 'user') {
    return Response.json({ error: 'A message is required.' }, { status: 400 })
  }
  if (latest.parts[0].text.length > MAX_TEXT_LENGTH) {
    return Response.json({ error: 'Message is too long.' }, { status: 400 })
  }

  const trimmed = recent.map(m => ({
    ...m,
    parts: [{ type: 'text' as const, text: m.parts[0].text.slice(0, MAX_TEXT_LENGTH) }],
  }))

  try {
    const result = streamText({
      model: MODEL,
      system,
      messages: await convertToModelMessages(trimmed),
      abortSignal: request.signal, // stops generation when the user clicks Stop
    })

    return result.toUIMessageStreamResponse({
      // Fail honestly: never substitute canned tax figures or dates for a model answer.
      onError: error => {
        console.error('[chat] stream error', error)
        return 'The assistant is unavailable right now. Please try again in a moment.'
      },
    })
  } catch (error) {
    console.error('[chat] AI request failed', error)
    return Response.json(
      { error: 'The assistant is unavailable right now. Please try again in a moment.' },
      { status: 503 },
    )
  }
}
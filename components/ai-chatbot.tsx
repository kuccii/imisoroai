'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import ReactMarkdown from 'react-markdown'

const SUGGESTIONS = [
  'How is net VAT calculated?',
  'What makes an expense "supported"?',
  'What do I need for an RRA e-Tax export?',
  'Explain input vs output VAT',
]

export function AIChatbot({ onClose }: { onClose?: () => void } = {}) {
  const { messages, sendMessage, regenerate, stop, setMessages, status, error } = useChat()
  const [input, setInput] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isBusy = status === 'submitted' || status === 'streaming'

  // Auto-scroll as new content streams in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    sendMessage({ text: trimmed })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a newline; ignore Enter during IME composition
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit(input)
    }
  }

  const clearChat = () => {
    stop()
    setMessages([])
  }

  const lastMessage = messages.at(-1)
  const canRegenerate = !isBusy && lastMessage?.role === 'assistant'
  // Show the "thinking" bubble until the first tokens arrive
  const showThinking =
    status === 'submitted' || (status === 'streaming' && lastMessage?.role === 'user')

  return (
    <div className="flex h-full w-full flex-col bg-[#f4f7f3]">
      <div className="flex items-center justify-between gap-2 border-b border-[#dce9e1] bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f5c49] text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zM19 14l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" />
            </svg>
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold text-[#10251f]">Imisoro AI assistant</h2>
            <p className="text-[11px] text-[#10251f]/55">AI-generated · informational only</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearChat}
            disabled={messages.length === 0}
            className="text-xs font-medium text-[#0f5c49] hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Clear
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="rounded-md p-1 text-[#10251f]/60 transition hover:bg-[#eef5f0] hover:text-[#10251f]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 space-y-3 overflow-y-auto p-6"
      >
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-8 text-center">
            <p className="text-sm text-[#10251f]/60">
              Ask about VAT, invoices, EBM evidence, e-Tax exports or filing deadlines.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-[#dce9e1] bg-white px-3 py-1.5 text-xs text-[#10251f] transition hover:border-[#0f5c49] hover:bg-[#eef5f0]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => {
          const isUser = message.role === 'user'
          const text = message.parts
            .map(part => (part.type === 'text' ? part.text : ''))
            .join('')
          if (!text) return null

          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${
                  isUser ? 'bg-[#0f5c49] text-white' : 'bg-white text-[#10251f]'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                ) : (
                  <div className="break-words">
                    <ReactMarkdown
                      components={{
                        p: props => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
                        ul: props => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
                        ol: props => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
                        strong: props => <strong className="font-semibold" {...props} />,
                        a: props => (
                          <a
                            className="text-[#0f5c49] underline"
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                          />
                        ),
                        code: props => (
                          <code className="rounded bg-[#f4f7f3] px-1 py-0.5 text-xs" {...props} />
                        ),
                        table: props => (
                          <div className="my-2 overflow-x-auto">
                            <table className="min-w-full border-collapse text-xs" {...props} />
                          </div>
                        ),
                        th: props => (
                          <th className="border border-[#dce9e1] px-2 py-1 text-left" {...props} />
                        ),
                        td: props => <td className="border border-[#dce9e1] px-2 py-1" {...props} />,
                      }}
                    >
                      {text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {showThinking && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-white px-4 py-2 text-sm text-[#10251f]/60">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            <span>{error.message || 'Something went wrong.'}</span>
            <button
              type="button"
              onClick={() => regenerate()}
              className="font-medium underline"
            >
              Retry
            </button>
          </div>
        )}

        {canRegenerate && !error && (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => regenerate()}
              className="text-xs font-medium text-[#0f5c49] hover:underline"
            >
              ↻ Regenerate response
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#dce9e1] bg-white p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            aria-label="Message"
            rows={1}
            maxLength={2000}
            className="flex-1 resize-none rounded-xl border border-[#dce9e1] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f8062]/20"
            style={{ minHeight: '44px', maxHeight: '160px' }}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="h-[44px] rounded-xl border border-[#0f5c49] px-4 text-sm font-bold text-[#0f5c49] transition hover:bg-[#eef5f0]"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={!input.trim()}
              className="h-[44px] rounded-xl bg-[#0f5c49] px-4 text-sm font-bold text-white transition hover:bg-[#0a493a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

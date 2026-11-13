'use client'

import { useEffect, useState } from 'react'
import { AIChatbot } from './ai-chatbot'

/**
 * Floating AI assistant: a labelled launcher button fixed at the bottom-right,
 * opening a chat panel docked above it (full-screen on phones).
 * The chat stays mounted while closed so the conversation isn't lost.
 */
export function AIChatLauncher() {
  const [open, setOpen] = useState(false)

  // Esc closes the panel
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const panelClassName =
    'fixed z-50 overflow-hidden border border-[#dce9e1] bg-[#f4f7f3] shadow-2xl ' +
    'inset-0 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:max-h-[calc(100vh-8rem)] sm:w-[400px] sm:rounded-2xl ' +
    (open ? 'flex' : 'hidden')

  return (
    <>
      <div
        id="ai-assistant-panel"
        role="dialog"
        aria-label="Imisoro AI assistant"
        className={panelClassName}
      >
        <AIChatbot onClose={() => setOpen(false)} />
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="ai-assistant-panel"
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        className="fixed bottom-6 right-6 z-50 items-center gap-2 rounded-full bg-[#0f5c49] py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#0a493a] focus:outline-none focus:ring-4 focus:ring-[#0f8062]/30"
      >
        {open ? (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* chat bubble */}
            <path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1121 12z" />
            {/* sparkle = AI */}
            <path
              d="M12 8.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
              fill="currentColor"
              stroke="none"
            />
          </svg>
        )}
        <span>{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </>
  )
}
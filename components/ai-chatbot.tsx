'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AIChatbot() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const router = useRouter()

  const sendMessage = async (text: string) => {
    const newMessage = { id: Date.now().toString(), text, sender: 'user' }
    setMessages(prev => [...prev, newMessage])
    setInput('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: data.response, sender: 'assistant' }])
      } else {
        setMessages(prev => [...prev, { id: (Date.now() + 2).toString(), text: 'Error: ' + (data.error || 'Unknown error'), sender: 'assistant' }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: (Date.now() + 3).toString(), text: 'Connection error', sender: 'assistant' }])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (input.trim()) {
        sendMessage(input)
      }
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="h-full w-full bg-[#f4f7f3] p-6 overflow-y-auto">
      <div className="h-full w-full space-y-2">
        {messages.map((msg: any) => (
          <div
            key={msg.id}
            className={`rounded-xl px-4 py-2 ${
              msg.sender === 'user'
                ? 'bg-[#0f5c49] text-white'
                : 'bg-white text-[#10251f] shadow-sm'
            }`}
          >
            <p className="text-sm line-clamp-3">{msg.text}</p>
          </div>
        ))}

        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-[#dce9e1] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f8062]"
            disabled={messages.length >= 20}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || messages.length >= 20}
            className="rounded-lg bg-[#0f5c49] px-4 py-2 text-sm font-bold text-white hover:bg-[#0a493a]"
          >
            Send
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-[#789087]">
        <button
          onClick={clearChat}
          className="hover:text-[#0f5c49] transition-colors"
          aria-label="Clear chat"
        >
          Clear
        </button>
        <button
          onClick={() => router.push('/')}
          className="hover:text-[#0f8062] transition-colors"
          aria-label="Go to dashboard"
        >
          Dashboard
        </button>
      </div>
    </div>
  )
}
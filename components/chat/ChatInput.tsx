'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Send, AlertTriangle } from 'lucide-react'
import { previewHasBlockedContent } from '@/lib/chat-filter'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { ChatMessageData } from './ChatMessage'

const MAX_LEN = 1000

interface ChatInputProps {
  orderId: string
  disabled?: boolean
  onSent?: (msg: ChatMessageData) => void
}

export function ChatInput({ orderId, disabled, onSent }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const trimmed = value.trim()
  const overLimit = value.length > MAX_LEN
  const hasBlocked = trimmed.length > 0 && previewHasBlockedContent(trimmed)
  const canSend = !disabled && !sending && trimmed.length > 0 && !overLimit

  async function send() {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Falha ao enviar.')
      }
      const data = await res.json()
      setValue('')
      onSent?.(data.message as ChatMessageData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido.')
    } finally {
      setSending(false)
      taRef.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="border-t bg-background p-3">
      {hasBlocked && (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Sua mensagem parece conter contato externo. Ela será filtrada
            automaticamente para sua proteção.
          </span>
        </div>
      )}
      {error && (
        <div className="mb-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Digite sua mensagem… (Enter envia · Shift+Enter quebra linha)"
          rows={2}
          maxLength={MAX_LEN + 50}
          disabled={disabled || sending}
          className={cn(
            'min-h-[44px] resize-none',
            overLimit && 'border-destructive',
          )}
        />
        <Button
          type="button"
          onClick={send}
          disabled={!canSend}
          size="icon"
          aria-label="Enviar mensagem"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-1 flex justify-end text-[10px] text-muted-foreground">
        <span className={cn(overLimit && 'text-destructive')}>
          {value.length}/{MAX_LEN}
        </span>
      </div>
    </div>
  )
}

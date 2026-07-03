'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage, type ChatMessageData } from './ChatMessage'
import { ChatInput } from './ChatInput'

interface ChatWindowProps {
  orderId: string
  currentUserId: string
  /** se o pedido não está em status que permite chat, desabilita o input */
  chatEnabled?: boolean
}

function formatDateLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Hoje'
  if (sameDay(d, yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ChatWindow({
  orderId,
  currentUserId,
  chatEnabled = true,
}: ChatWindowProps) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ─── Carrega histórico inicial ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders/${orderId}/messages`)
      .then(async (r) => {
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(b.error ?? 'Falha ao carregar.')
        }
        return r.json() as Promise<{ messages: ChatMessageData[] }>
      })
      .then((d) => {
        if (!cancelled) setMessages(d.messages)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  // ─── Realtime subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel: RealtimeChannel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessageData
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [orderId, supabase])

  // ─── Presença online: atualiza last_seen_at ao montar ───────────────
  useEffect(() => {
    void supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', currentUserId)
  }, [currentUserId, supabase])

  // ─── Auto-scroll ao receber nova mensagem ───────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // ─── Agrupa por data ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const groups: { label: string; items: ChatMessageData[] }[] = []
    for (const msg of messages) {
      const label = formatDateLabel(msg.created_at)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(msg)
      else groups.push({ label, items: [msg] })
    }
    return groups
  }, [messages])

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Chat do pedido</h3>
        <p className="text-xs text-muted-foreground">
          Negocie sempre pela plataforma. Contatos externos são bloqueados.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        aria-live="polite"
      >
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Carregando mensagens…
          </div>
        )}
        {error && !loading && (
          <div className="py-6 text-center text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Inicie a conversa.
          </div>
        )}
        {!loading &&
          grouped.map((g) => (
            <div key={g.label}>
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </span>
              </div>
              {g.items.map((m) => (
                <ChatMessage
                  key={m.id}
                  message={m}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          ))}
      </div>

      <ChatInput 
        orderId={orderId} 
        disabled={!chatEnabled} 
        onSent={(newMsg) => setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })} 
      />
    </div>
  )
}

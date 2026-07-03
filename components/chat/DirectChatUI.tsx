'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChatMessage, type ChatMessageData } from './ChatMessage'
import { ChatInput } from './ChatInput' // Wait, I need to adapt ChatInput or create DirectChatInput
import { Send, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface ChatSummary {
  id: string
  other_user: { id: string; username: string; avatar_url: string | null }
  last_message?: { id: string; message: string; created_at: string; sender_id: string }
  updated_at: string
}

export function DirectChatUI({ currentUserId, initialChatId }: { currentUserId: string, initialChatId?: string | null }) {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null)
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 1. Fetch chats
  useEffect(() => {
    async function loadChats() {
      try {
        const res = await fetch('/api/chats')
        if (res.ok) {
          const data = await res.json()
          setChats(data)
        }
      } finally {
        setLoadingChats(false)
      }
    }
    loadChats()
  }, [])

  // 2. Fetch messages for active chat
  useEffect(() => {
    if (!activeChatId) {
      setMessages([])
      return
    }
    let isMounted = true
    setLoadingMessages(true)
    async function loadMessages() {
      try {
        const res = await fetch(`/api/chats/${activeChatId}/messages`)
        if (res.ok && isMounted) {
          const data = await res.json()
          setMessages(data)
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 100)
        }
      } finally {
        if (isMounted) setLoadingMessages(false)
      }
    }
    loadMessages()

    return () => { isMounted = false }
  }, [activeChatId])

  // 3. Realtime subscription for active chat
  useEffect(() => {
    if (!activeChatId) return

    const channel = supabase
      .channel(`direct_chat:${activeChatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `chat_id=eq.${activeChatId}` },
        async (payload) => {
          const incoming = payload.new as any
          if (incoming.sender_id === currentUserId) return // Já adicionamos optimisticamente
          
          // Não precisamos de profile pois ChatMessage não renderiza isso
          
          const msgData: ChatMessageData = {
            id: incoming.id,
            order_id: '',
            type: 'text',
            is_filtered: false,
            message: incoming.message,
            created_at: incoming.created_at,
            sender_id: incoming.sender_id,
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev
            return [...prev, msgData]
          })
          
          setTimeout(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }, 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChatId, currentUserId, supabase])

  // Realtime global para atualizar a lista de chats quando chega nova msg num chat não ativo
  useEffect(() => {
    const channel = supabase
      .channel(`user_chats:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_chats' },
        (payload) => {
          // Quando um chat atualiza o updated_at, buscamos de novo a lista pra reordenar
          // Para simplificar, faremos um fetch rápido
          fetch('/api/chats').then(res => res.json()).then(data => setChats(data))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId, supabase])

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar de Chats */}
      <div className="w-full md:w-80 border-r border-border/40 flex flex-col bg-background/50">
        <div className="p-4 border-b border-border/40 font-semibold text-sm">Conversas</div>
        <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma conversa. Faça uma transação com alguém para liberar o chat.
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={cn(
                  "w-full text-left flex flex-col gap-1 p-4 hover:bg-white/5 transition-colors border-b border-border/10",
                  activeChatId === chat.id && "bg-[var(--gm-violet)]/10 hover:bg-[var(--gm-violet)]/15 border-l-2 border-l-[var(--gm-violet)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={chat.other_user?.avatar_url || ''} />
                    <AvatarFallback>{chat.other_user?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate">{chat.other_user?.username || 'Usuário'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {chat.last_message?.message || 'Nenhuma mensagem.'}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Janela de Chat */}
      <div className="flex-1 flex flex-col bg-background relative h-full">
        {!activeChatId ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-4 text-muted-foreground opacity-50">
            <span className="material-symbols-outlined text-6xl">chat</span>
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4" ref={scrollRef}>
              {loadingMessages ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Carregando mensagens...</div>
              ) : messages.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Mande a primeira mensagem!</div>
              ) : (
                messages.map((m) => (
                  <ChatMessage key={m.id} message={m} currentUserId={currentUserId} />
                ))
              )}
            </div>
            <DirectChatInput 
              chatId={activeChatId} 
              onSent={(newMsg) => {
                setMessages(prev => [...prev, newMsg])
                setTimeout(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }, 100)
              }} 
            />
          </>
        )}
      </div>
    </div>
  )
}

function DirectChatInput({ chatId, onSent }: { chatId: string, onSent: (msg: ChatMessageData) => void }) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  async function send() {
    if (!value.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value.trim() })
      })
      if (!res.ok) throw new Error('Erro ao enviar')
      const data = await res.json()
      setValue('')
      onSent(data.message)
    } catch (e) {
      setError('Falha ao enviar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-border/40 bg-surface/50 p-3">
      {error && <div className="mb-2 text-xs text-destructive">{error}</div>}
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Mensagem..."
          className="min-h-[44px] max-h-32 resize-none"
          disabled={sending}
        />
        <Button onClick={send} disabled={!value.trim() || sending} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

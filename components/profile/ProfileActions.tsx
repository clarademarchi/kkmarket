'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function ProfileActions({ username, userId }: { username: string, userId: string }) {
  const [following, setFollowing] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const router = useRouter()

  const handleFollow = () => {
    setFollowing(!following)
    if (!following) {
      toast.success(`Você começou a seguir ${username}!`)
    } else {
      toast.info(`Você deixou de seguir ${username}.`)
    }
  }

  const handleChat = async () => {
    if (loadingChat) return
    setLoadingChat(true)
    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        toast.error(data.error || 'Erro ao iniciar chat.')
        return
      }

      router.push(`/painel/mensagens?chatId=${data.chatId}`)
    } catch (e) {
      toast.error('Ocorreu um erro inesperado.')
    } finally {
      setLoadingChat(false)
    }
  }

  return (
    <div className="flex gap-2">
      <button 
        onClick={handleFollow}
        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
          following 
            ? 'border-[var(--gm-violet)] bg-[var(--gm-violet)]/10 text-[var(--gm-violet)]' 
            : 'border-[var(--gm-ink-faint)]/40 text-[var(--gm-ink-dim)] hover:border-[var(--gm-violet)]/50 hover:text-[var(--gm-ink)]'
        }`}
      >
        {following ? '♥ seguindo' : '♡ seguir'}
      </button>
      <button 
        onClick={handleChat}
        className="flex-1 rounded-lg bg-[var(--gm-violet)] px-3 py-2 text-xs font-black text-[#1a1126] hover:opacity-90 transition-all gm-glow"
      >
        💬 chat
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Info, AlertTriangle, ShieldCheck, ShoppingBag, Banknote } from 'lucide-react'
import { markAsReadAction, markAllAsReadAction } from './actions'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  reference_id: string | null
  reference_type: string | null
}

const getIconForType = (type: string) => {
  if (type.includes('order') || type.includes('purchase')) return <ShoppingBag className="h-5 w-5 text-[var(--gm-cyan)]" />
  if (type.includes('payment') || type.includes('wallet') || type.includes('withdrawal')) return <Banknote className="h-5 w-5 text-[var(--gm-green)]" />
  if (type.includes('alert') || type.includes('warning')) return <AlertTriangle className="h-5 w-5 text-[var(--gm-amber)]" />
  if (type.includes('security') || type.includes('auth')) return <ShieldCheck className="h-5 w-5 text-[var(--gm-violet)]" />
  return <Info className="h-5 w-5 text-[var(--gm-ink-faint)]" />
}

export default function NotificationsClient({ items: initialItems }: { items: Notification[] }) {
  const [items, setItems] = useState<Notification[]>(initialItems ?? [])
  const [markingAll, setMarkingAll] = useState(false)
  const router = useRouter()

  const unreadCount = items.filter((i) => !i.is_read).length

  async function handleMarkAsRead(id: string) {
    // Optimistic UI update
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    await markAsReadAction(id)
  }

  async function handleMarkAllAsRead() {
    setMarkingAll(true)
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await markAllAsReadAction()
    setMarkingAll(false)
  }

  async function handleRowClick(notification: Notification) {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id)
    }
    if (notification.type === 'message_received' && notification.reference_type === 'direct_chat') {
      router.push(`/painel/mensagens?chatId=${notification.reference_id}`)
    } else if (notification.type === 'message_received' && notification.reference_type === 'order') {
      router.push(`/pedidos/${notification.reference_id}`)
    } else if (notification.type === 'order_new' || notification.type === 'order_paid') {
      router.push(`/pedidos/${notification.reference_id}`)
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--gm-ink-faint)]/20 bg-[var(--gm-paper-2)] p-12 text-center">
        <Bell className="mx-auto h-8 w-8 text-[var(--gm-ink-faint)]/50 mb-4" />
        <p className="text-[var(--gm-ink-dim)]">Nenhuma notificação por enquanto.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleMarkAllAsRead}
            disabled={markingAll}
            className="flex items-center gap-2 text-xs font-bold text-[var(--gm-violet)] hover:text-[var(--gm-ink)] transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Marcar todas como lidas
          </button>
        </div>
      )}

      {items.map((notification) => (
        <div
          key={notification.id}
          onClick={() => handleRowClick(notification)}
          className={`relative flex items-start gap-4 rounded-2xl border p-5 transition-all cursor-pointer hover:brightness-110 ${
            notification.is_read
              ? 'border-[var(--gm-ink-faint)]/10 bg-[var(--gm-paper)] opacity-70'
              : 'border-[var(--gm-violet)]/30 bg-[var(--gm-paper-2)] shadow-[0_4px_20px_-8px_var(--gm-violet)]'
          }`}
        >
          {/* Unread dot */}
          {!notification.is_read && (
            <div className="absolute top-5 right-5 h-2 w-2 rounded-full bg-[var(--gm-violet)]" />
          )}

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gm-paper-3)] border border-[var(--gm-ink-faint)]/20">
            {getIconForType(notification.type)}
          </div>

          <div className="flex-1 pr-6">
            <h3 className={`text-sm font-black ${notification.is_read ? 'text-[var(--gm-ink-dim)]' : 'text-[var(--gm-ink)]'}`}>
              {notification.title}
            </h3>
            <p className="mt-1 text-sm text-[var(--gm-ink-faint)] leading-relaxed">
              {notification.message}
            </p>
            <span className="mt-3 block text-[10px] font-bold text-[var(--gm-ink-faint)]/50 uppercase tracking-widest">
              {new Date(notification.created_at).toLocaleString('pt-BR')}
            </span>
          </div>

          {!notification.is_read && (
            <button
              onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notification.id) }}
              className="absolute bottom-5 right-5 rounded-full bg-[var(--gm-paper-3)] p-2 text-[var(--gm-ink-faint)] hover:bg-[var(--gm-violet)]/20 hover:text-[var(--gm-violet)] transition-colors"
              title="Marcar como lida"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

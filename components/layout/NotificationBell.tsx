'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NotificationData {
  id: string
  title: string
  message: string
  type: string
  reference_id: string | null
  reference_type: string | null
  created_at: string
  is_read: boolean
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  // 1. Pegar usuário e carregar notificações não lidas
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadNotifications(user.id)
      }
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
        loadNotifications(session.user.id)
      } else {
        setUserId(null)
        setNotifications([])
      }
    })

    return () => authListener.subscription.unsubscribe()
  }, [supabase])

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (data) setNotifications(data)
  }

  // 2. Realtime listener
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`bell_notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const newNotif = payload.new as NotificationData
          setNotifications((prev) => [newNotif, ...prev])
          
          // Disparar toast
          if (newNotif.type === 'chat_message') {
            toast.message(newNotif.title, {
              description: newNotif.message,
              action: {
                label: 'Abrir Chat',
                onClick: () => {
                  if (newNotif.reference_type === 'direct_chat') {
                    router.push(`/painel/mensagens`)
                  } else {
                    router.push(`/pedidos/${newNotif.reference_id}`)
                  }
                },
              },
            })
          } else {
            toast.info(newNotif.title, {
              description: newNotif.message,
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, router])

  // 3. Marcar como lida e redirecionar
  async function handleClick(notif: NotificationData) {
    // Marcar local
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    // Marcar BD
    await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)

    // Redirecionamento
    if (notif.type === 'chat_message') {
      if (notif.reference_type === 'direct_chat') {
        router.push(`/painel/mensagens`)
      } else {
        router.push(`/pedidos/${notif.reference_id}`)
      }
    } else {
      router.push('/notificacoes')
    }
  }

  if (!userId) return null

  const unreadCount = notifications.length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative flex h-10 w-10 items-center justify-center rounded-md text-[var(--gm-ink-dim)] hover:text-[var(--gm-ink)] hover:bg-[var(--gm-paper-3)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--gm-violet)] text-[9px] font-bold text-[#1a1126] shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden bg-surface/95 backdrop-blur-xl border-border/40 shadow-2xl">
        <div className="p-3 border-b border-border/40 flex items-center justify-between bg-black/20">
          <span className="text-sm font-semibold text-[var(--gm-ink)]">Notificações</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 text-xs text-[var(--gm-ink-faint)] hover:text-[var(--gm-violet)]"
              onClick={async (e) => {
                e.stopPropagation()
                const ids = notifications.map(n => n.id)
                setNotifications([])
                await supabase.from('notifications').update({ is_read: true }).in('id', ids)
              }}
            >
              Marcar tudo como lido
            </Button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto flex flex-col">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-[var(--gm-ink-faint)]">
              Você não tem novas notificações.
            </div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem 
                key={n.id} 
                onClick={() => handleClick(n)}
                className={cn(
                  "flex flex-col items-start gap-1 p-3 cursor-pointer border-b border-border/10 focus:bg-white/5",
                  !n.is_read && "bg-white/[0.02]"
                )}
              >
                <span className="text-sm font-semibold text-[var(--gm-ink)] line-clamp-1">{n.title}</span>
                <span className="text-xs text-[var(--gm-ink-dim)] line-clamp-2 leading-snug">{n.message}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <div className="p-2 border-t border-border/40 bg-black/20 text-center">
          <Button variant="ghost" size="sm" className="w-full text-xs text-[var(--gm-violet)]" onClick={() => router.push('/notificacoes')}>
            Ver todas
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

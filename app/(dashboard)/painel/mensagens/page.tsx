import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DirectChatUI } from '@/components/chat/DirectChatUI'

export const metadata = {
  title: 'Mensagens Diretas',
}

export default async function MensagensPage({ searchParams }: { searchParams: Promise<{ chatId?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const params = await searchParams
  const initialChatId = params.chatId || null

  if (!user) redirect('/entrar')

  return (
    <div className="flex h-[calc(100vh-80px)] w-full flex-col p-4 md:p-8 overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mensagens</h1>
        <p className="text-sm text-muted-foreground">Sua caixa de entrada</p>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-border/40 bg-surface shadow-sm">
        <DirectChatUI currentUserId={user.id} initialChatId={initialChatId} />
      </div>
    </div>
  )
}

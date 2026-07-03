import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Listar chats diretos do usuário
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Buscar todos os chats onde o usuário é participante, fazendo join com profiles
  const { data: chats, error } = await supabase
    .from('direct_chats')
    .select(`
      id, participant1_id, participant2_id, updated_at,
      participant1:profiles!participant1_id(id, username, avatar_url),
      participant2:profiles!participant2_id(id, username, avatar_url),
      direct_messages(id, message, created_at, sender_id)
    `)
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Formatar para ficar fácil para o frontend
  const formattedChats = chats.map((chat) => {
    const isP1 = chat.participant1_id === user.id
    const otherUser = isP1 ? chat.participant2 : chat.participant1
    
    // Pega a última mensagem, as mensagens já vêm ordenadas? 
    // É melhor ordenar aqui ou na query. Como supabase restringe joins complexos, ordenamos manual
    const messages = chat.direct_messages as any[]
    messages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const lastMessage = messages[0] || null

    return {
      id: chat.id,
      other_user: Array.isArray(otherUser) ? otherUser[0] : otherUser,
      last_message: lastMessage,
      updated_at: chat.updated_at,
    }
  })

  return NextResponse.json(formattedChats)
}

// Iniciar um novo chat direto com um usuário
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { targetUserId } = await req.json()

  if (!targetUserId || targetUserId === user.id) {
    return NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 })
  }

  // 1. Verificar se existe uma transação entre os dois
  const admin = createAdminClient()
  const { data: orders, error: ordersErr } = await admin
    .from('orders')
    .select('id')
    .or(`and(buyer_id.eq.${user.id},seller_id.eq.${targetUserId}),and(buyer_id.eq.${targetUserId},seller_id.eq.${user.id})`)
    .limit(1)

  if (ordersErr) {
    return NextResponse.json({ error: 'Erro ao verificar transações.' }, { status: 500 })
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json(
      { error: 'Você só pode iniciar um chat com usuários com quem já realizou uma transação.' },
      { status: 403 }
    )
  }

  // 2. Transação existe, vamos garantir que o chat não exista ainda
  const p1 = user.id < targetUserId ? user.id : targetUserId
  const p2 = user.id < targetUserId ? targetUserId : user.id

  const { data: existingChat } = await admin
    .from('direct_chats')
    .select('id')
    .eq('participant1_id', p1)
    .eq('participant2_id', p2)
    .single()

  if (existingChat) {
    return NextResponse.json({ chatId: existingChat.id })
  }

  // 3. Criar o chat
  const { data: newChat, error: insertErr } = await admin
    .from('direct_chats')
    .insert({
      participant1_id: p1,
      participant2_id: p2,
    })
    .select('id')
    .single()

  if (insertErr || !newChat) {
    return NextResponse.json({ error: 'Falha ao criar chat.' }, { status: 500 })
  }

  return NextResponse.json({ chatId: newChat.id })
}

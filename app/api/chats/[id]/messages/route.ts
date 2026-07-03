import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { filterMessage } from '@/lib/chat-filter'

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const chatId = params.id
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Obter mensagens com RLS garantindo segurança
  const { data: messages, error } = await supabase
    .from('direct_messages')
    .select(`
      id, message, created_at, sender_id,
      profiles!sender_id ( username, avatar_url, role )
    `)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mapped = messages.map((m: any) => ({
    id: m.id,
    message: m.message,
    created_at: m.created_at,
    sender_id: m.sender_id,
    sender_username: m.profiles?.username || 'User',
    sender_avatar_url: m.profiles?.avatar_url || null,
    sender_role: m.profiles?.role || 'user',
  }))

  return NextResponse.json(mapped)
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const chatId = params.id
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { message } = await req.json()
  const trimmed = message?.trim()
  if (!trimmed) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
  }

  // 1. Verificar permissão usando query segura (RLS não aplica na API admin, mas fazemos select aqui com usuário)
  const { data: chat, error: chatErr } = await supabase
    .from('direct_chats')
    .select('participant1_id, participant2_id')
    .eq('id', chatId)
    .single()

  if (chatErr || !chat) {
    return NextResponse.json({ error: 'Chat não encontrado ou acesso negado.' }, { status: 403 })
  }

  // 2. Aplicar filtro
  const filtered = filterMessage(trimmed)

  // 3. Inserir via admin ou supabase client (RLS de insert funciona)
  const admin = createAdminClient()
  const { data: inserted, error: insertErr } = await admin
    .from('direct_messages')
    .insert({
      chat_id: chatId,
      sender_id: user.id,
      message: filtered.text,
    })
    .select(`
      id, message, created_at, sender_id,
      profiles!sender_id ( username, avatar_url, role )
    `)
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: 'Falha ao salvar' }, { status: 500 })
  }

  // Atualizar updated_at do chat
  await admin.from('direct_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId)

  // Notificar o outro participante via `notifications` tabela global
  const recipientId = chat.participant1_id === user.id ? chat.participant2_id : chat.participant1_id
  await admin.from('notifications').insert({
    user_id: recipientId,
    type: 'chat_message',
    title: 'Nova mensagem (Direta)',
    message: `Você recebeu uma nova mensagem direta.`,
    reference_id: chatId,
    reference_type: 'direct_chat',
  })

  // Format response for UI (ChatMessageData shape)
  const mappedMessage = {
    id: inserted.id,
    message: inserted.message,
    created_at: inserted.created_at,
    sender_id: inserted.sender_id,
    sender_username: (inserted as any).profiles?.username || 'User',
    sender_avatar_url: (inserted as any).profiles?.avatar_url || null,
    sender_role: (inserted as any).profiles?.role || 'user',
  }

  return NextResponse.json({ message: mappedMessage }, { status: 201 })
}

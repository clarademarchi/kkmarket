/**
 * /api/orders/[id]/messages
 *
 * GET  → lista mensagens do chat do pedido (paginação simples)
 * POST → envia mensagem (com filtro anti-bypass server-side)
 *
 * Auth: somente buyer ou seller participantes do pedido.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { filterMessage } from '@/lib/chat-filter'

// ─── Constantes ───────────────────────────────────────────────────────
const CHAT_OPEN_STATUSES = ['paid', 'in_delivery', 'delivered', 'disputed'] as const
const MAX_MESSAGE_LEN = 1000
const BYPASS_THRESHOLD_24H = 3

// ─── Schemas ──────────────────────────────────────────────────────────
const postSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Mensagem vazia.')
    .max(MAX_MESSAGE_LEN, `Mensagem excede ${MAX_MESSAGE_LEN} caracteres.`),
})

// ──────────────────────────────────────────────────────────────────────
// GET — listar histórico
// ──────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // Verifica se usuário participa do pedido
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, buyer_id, seller_id, status')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }
  if (order.buyer_id !== user.id && order.seller_id !== user.id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { data: messages, error } = await supabase
    .from('order_messages')
    .select(
      'id, order_id, sender_id, message, type, is_filtered, created_at',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[messages.GET]', error)
    return NextResponse.json(
      { error: 'Falha ao carregar mensagens.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ messages: messages ?? [] })
}

// ──────────────────────────────────────────────────────────────────────
// POST — enviar mensagem
// ──────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params

  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // 2. Body
  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await request.json())
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? 'Dados inválidos.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  // 3. Order exists + participação + status permite chat
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, buyer_id, seller_id, status')
    .eq('id', orderId)
    .single()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
  }
  if (order.buyer_id !== user.id && order.seller_id !== user.id) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }
  if (!CHAT_OPEN_STATUSES.includes(order.status as (typeof CHAT_OPEN_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'Chat indisponível para este status do pedido.' },
      { status: 409 },
    )
  }

  // 4. Filtro anti-bypass
  const result = filterMessage(body.message)
  const admin = createAdminClient()

  // 5. Insert da mensagem (usa client autenticado para respeitar RLS)
  const { data: inserted, error: insertErr } = await supabase
    .from('order_messages')
    .insert({
      order_id: orderId,
      sender_id: user.id,
      message: result.filtered ? result.content : body.message,
      type: 'text',
      is_filtered: result.filtered,
    })
    .select('id, order_id, sender_id, message, type, is_filtered, created_at')
    .single()

  if (insertErr || !inserted) {
    console.error('[messages.POST] insert', insertErr)
    return NextResponse.json(
      { error: 'Falha ao enviar mensagem.' },
      { status: 500 },
    )
  }

  // 6. Tratamento de bypass
  if (result.filtered) {
    // 6a. Log do conteúdo original (admin only)
    await admin.from('admin_logs').insert({
      event_type: 'chat_bypass_attempt',
      user_id: user.id,
      reference_id: inserted.id,
      payload: {
        order_id: orderId,
        original_content: result.originalContent,
        sanitized_content: result.content,
        match_count: result.matchCount,
      },
    })

    // 6b. Conta tentativas nas últimas 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from('admin_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'chat_bypass_attempt')
      .eq('user_id', user.id)
      .gte('created_at', since)

    if ((count ?? 0) >= BYPASS_THRESHOLD_24H) {
      // 6c. Notifica todos os admins
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')

      if (admins && admins.length > 0) {
        await admin.from('notifications').insert(
          admins.map((a) => ({
            user_id: a.id,
            type: 'system',
            title: 'Tentativa repetida de bypass no chat',
            message: `Usuário ${user.id} acumulou ${count} tentativas em 24h no pedido ${orderId}.`,
            reference_id: orderId,
            reference_type: 'order',
          })),
        )
      }
    }
  }

  // 7. Notificar o destinatário se houver (para chat global)
  const recipientId = order.buyer_id === user.id ? order.seller_id : order.buyer_id
  await admin.from('notifications').insert({
    user_id: recipientId,
    type: 'message_received',
    title: 'Nova mensagem no chat',
    message: `Você recebeu uma nova mensagem no pedido #${orderId.slice(0, 8)}`,
    reference_id: orderId,
    reference_type: 'order',
  })

  // 8. last_seen_at do remetente (presença online)
  await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ message: inserted }, { status: 201 })
}

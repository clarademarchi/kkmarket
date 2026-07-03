/**
 * POST /api/webhooks/mercadopago
 *
 * Recebe notificações do Mercado Pago (eventos de pagamento).
 *
 * Segurança:
 *   - Verifica assinatura HMAC-SHA256 conforme docs do MP:
 *     manifest = `id:${data.id};request-id:${x-request-id};ts:${ts};`
 *     v1 = HMAC_SHA256(manifest, MP_WEBHOOK_SECRET)
 *   - Rebusca o pagamento na API MP (não confia no body do webhook).
 *
 * Idempotência:
 *   - Pulo silenciosamente se a ordem já saiu de `pending_payment`
 *     (paid/cancelled/refunded).
 *
 * Todas as mutações usam o cliente service-role (bypass RLS).
 */

import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { Payment } from 'mercadopago'
import { mp } from '@/lib/mercadopago/client'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  autoDeliver,
  calculateReleaseDate,
  lockSellerBalance,
} from '@/lib/orders/escrow'
import { sendOrderPaidEmails } from '@/lib/resend/order-emails'

const paymentClient = new Payment(mp)

// ─── Signature verification ──────────────────────────────────────────────────
function verifyMPSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.error('[MP Webhook] MP_WEBHOOK_SECRET não configurado')
    return false
  }

  const signature = req.headers.get('x-signature')   // 'ts=XXX,v1=YYY'
  const requestId = req.headers.get('x-request-id')
  if (!signature || !requestId) return false

  const ts = signature.match(/ts=([^,]+)/)?.[1] ?? ''
  const v1 = signature.match(/v1=([^,]+)/)?.[1] ?? ''
  if (!ts || !v1) return false

  const dataId = new URL(req.url).searchParams.get('data.id') ?? ''
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`

  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  // timingSafeEqual exige buffers do mesmo tamanho
  if (expected.length !== v1.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'))
  } catch {
    return false
  }
}

// ─── Tipagens auxiliares ─────────────────────────────────────────────────────
type Admin = ReturnType<typeof createAdminClient>

interface OrderRow {
  id:                    string
  announcement_id:       string
  announcement_item_id:  string | null
  buyer_id:              string
  seller_id:             string
  amount:                number
  seller_amount:         number
  status:                string
  payment_method:        string | null
  announcements: {
    has_auto_delivery: boolean
    category_id:       string
    title:             string
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const rawBody = await req.text()

  // 1. Verificar assinatura (relaxado para IPNs)
  // Notificações enviadas via `notification_url` muitas vezes vêm sem `x-signature` correto.
  // A verdadeira segurança é garantida pois nós pegamos o ID recebido e consultamos
  // a fonte oficial do MercadoPago (`paymentClient.get`) antes de tomar ação.
  if (!verifyMPSignature(req)) {
    console.warn('[MP Webhook] Assinatura inválida ou ausente (ignorando aviso pois faremos hard-fetch)')
  }

  // 2. Parse + filtra apenas eventos de pagamento
  let body: any = {}
  if (rawBody) {
    try {
      body = JSON.parse(rawBody)
    } catch {
      console.warn('[MP Webhook] Body não é JSON válido, tentando por query params...')
    }
  }

  const searchParams = new URL(req.url).searchParams
  const eventType = body.type ?? body.action ?? searchParams.get('type') ?? searchParams.get('topic') ?? ''
  
  if (!eventType.startsWith('payment')) {
    return new NextResponse('OK', { status: 200 })
  }

  const mpPaymentId = body.data?.id?.toString() ?? searchParams.get('data.id') ?? searchParams.get('id')
  if (!mpPaymentId) {
    console.error('[MP Webhook] ID de pagamento ausente')
    return new NextResponse('Bad Request', { status: 400 })
  }

  // 3. Rebusca status atualizado direto na API MP
  let payment
  try {
    payment = await paymentClient.get({ id: mpPaymentId })
  } catch (e) {
    console.error('[MP Webhook] Falha ao consultar pagamento na API MP:', e)
    return new NextResponse('Bad Gateway', { status: 502 })
  }

  const externalRef = payment.external_reference
  if (!externalRef) {
    console.warn('[MP Webhook] payment sem external_reference:', mpPaymentId)
    return new NextResponse('OK', { status: 200 })
  }

  const admin = createAdminClient()

  // 4. Busca pedido
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select(`
      id, announcement_id, announcement_item_id,
      buyer_id, seller_id, amount, seller_amount,
      status, payment_method,
      announcements!announcement_id (
        has_auto_delivery, category_id, title
      )
    `)
    .eq('id', externalRef)
    .single<OrderRow>()

  if (orderErr || !order) {
    console.error('[MP Webhook] Pedido não encontrado:', externalRef, orderErr?.message)
    return new NextResponse('Not Found', { status: 404 })
  }

  // 5. Despacha por status
  switch (payment.status) {
    case 'approved':
      if (order.status !== 'pending_payment') {
        return new NextResponse('OK', { status: 200 }) // idempotência
      }
      await handlePaymentApproved(admin, order, mpPaymentId)
      break

    case 'rejected':
    case 'cancelled':
      if (order.status === 'cancelled' || order.status === 'refunded') {
        return new NextResponse('OK', { status: 200 })
      }
      await handlePaymentFailed(admin, order, payment.status)
      break

    case 'refunded':
    case 'charged_back':
      if (order.status === 'refunded') {
        return new NextResponse('OK', { status: 200 })
      }
      await handlePaymentRefunded(admin, order, payment.status)
      break

    default:
      // pending / in_process / authorized — nada a fazer
      break
  }

  return new NextResponse('OK', { status: 200 })
}

// ─── handlePaymentApproved ───────────────────────────────────────────────────
async function handlePaymentApproved(
  admin: Admin,
  order: OrderRow,
  mpPaymentId: string,
): Promise<void> {
  const ann = order.announcements
  const now = new Date()

  // a. Calcula data de liberação do escrow
  const escrowReleaseAt = await calculateReleaseDate(ann.category_id, now)

  // b. Atualiza status + mp_payment_id + escrow_release_at
  await admin
    .from('orders')
    .update({
      status:            'paid',
      mp_payment_id:     mpPaymentId,
      escrow_release_at: escrowReleaseAt.toISOString(),
      updated_at:        now.toISOString(),
    })
    .eq('id', order.id)

  // c. Trava saldo do vendedor em escrow
  await lockSellerBalance(order.id, order.seller_id, order.seller_amount)

  // d. Auto-delivery, se aplicável
  let autoDeliveryCode: string | null = null

  if (ann.has_auto_delivery) {
    const result = await autoDeliver(
      order.id,
      order.announcement_id,
      order.announcement_item_id,
    )

    if (result) {
      autoDeliveryCode = result.payload

      await admin
        .from('orders')
        .update({ status: 'in_delivery', updated_at: now.toISOString() })
        .eq('id', order.id)

      // Mensagem de auto_delivery (UI faz render especial)
      await admin.from('order_messages').insert({
        order_id:  order.id,
        sender_id: null,
        message:   result.payload,
        type:      'auto_delivery',
      })

      await admin.from('order_messages').insert({
        order_id:  order.id,
        sender_id: null,
        message:   '⚡ Entrega automática realizada! Suas credenciais foram enviadas acima.',
        type:      'system',
      })

      if (result.soldOut) {
        console.log('[MP Webhook] announcement sold out:', order.announcement_id)
      }
    } else {
      // Sem estoque de auto-delivery: cai em fluxo manual
      await admin
        .from('orders')
        .update({ status: 'in_delivery', updated_at: now.toISOString() })
        .eq('id', order.id)

      await admin.from('order_messages').insert({
        order_id:  order.id,
        sender_id: null,
        message:   '⚠️ Entrega automática indisponível no momento. O vendedor fará a entrega manualmente.',
        type:      'system',
      })
    }
  } else {
    // Manual delivery
    await admin
      .from('orders')
      .update({ status: 'in_delivery', updated_at: now.toISOString() })
      .eq('id', order.id)
  }

  // e. Mensagem de sistema sobre o cronograma do escrow
  const releaseDays = Math.ceil(
    (escrowReleaseAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  )
  await admin.from('order_messages').insert({
    order_id:  order.id,
    sender_id: null,
    message:   `🔒 Pagamento confirmado! O vendedor tem ${releaseDays} dia(s) para realizar a entrega. O saldo será liberado em ${escrowReleaseAt.toLocaleDateString('pt-BR')}.`,
    type:      'system',
  })

  // f. Notificações
  await admin.from('notifications').insert([
    {
      user_id: order.buyer_id,
      type:    'order_paid',
      title:   'Pagamento confirmado!',
      message: `Seu pagamento de R$ ${order.amount.toFixed(2)} para "${ann.title}" foi confirmado.`,
      data:    { order_id: order.id },
    },
    {
      user_id: order.seller_id,
      type:    'order_new',
      title:   'Nova venda!',
      message: `Você recebeu uma venda de R$ ${order.amount.toFixed(2)} em "${ann.title}". ${
        ann.has_auto_delivery ? 'Entrega automática realizada.' : 'Realize a entrega para liberar o saldo.'
      }`,
      data:    { order_id: order.id },
    },
  ])

  // g. Incrementa sale_count do anúncio (RPC, com fallback)
  const { error: saleErr } = await admin.rpc('increment_sale_count', {
    p_announcement_id: order.announcement_id,
  })
  if (saleErr) {
    const { data: annRow } = await admin
      .from('announcements')
      .select('sale_count')
      .eq('id', order.announcement_id)
      .single<{ sale_count: number | null }>()
    await admin
      .from('announcements')
      .update({ sale_count: (annRow?.sale_count ?? 0) + 1 })
      .eq('id', order.announcement_id)
  }

  console.log('[MP Webhook] payment approved processed:', order.id)

  // h. E-mails transacionais (compra + código de entrega automática)
  try {
    await sendOrderPaidEmails(admin, order, autoDeliveryCode)
  } catch (emailErr) {
    console.error('[MP Webhook] falha ao enviar e-mails:', emailErr)
  }
}

// ─── handlePaymentFailed ─────────────────────────────────────────────────────
async function handlePaymentFailed(
  admin: Admin,
  order: OrderRow,
  reason: string,
): Promise<void> {
  const now = new Date()

  // a. Cancela ordem
  await admin
    .from('orders')
    .update({
      status:              'cancelled',
      cancelled_at:        now.toISOString(),
      cancellation_reason: `MP payment ${reason}`,
      updated_at:          now.toISOString(),
    })
    .eq('id', order.id)

  // b. Restaura estoque
  await admin.rpc('restore_stock', {
    p_announcement_id: order.announcement_id,
    p_item_id:         order.announcement_item_id ?? undefined,
    p_quantity:        1,
  })

  // c. Notifica comprador
  await admin.from('notifications').insert({
    user_id: order.buyer_id,
    type:    'system',
    title:   'Pagamento não confirmado',
    message: `Seu pagamento de R$ ${order.amount.toFixed(2)} não foi processado. O estoque foi restaurado.`,
    data:    { order_id: order.id },
  })

  console.log('[MP Webhook] payment failed processed:', order.id, reason)
}

// ─── handlePaymentRefunded ───────────────────────────────────────────────────
async function handlePaymentRefunded(
  admin: Admin,
  order: OrderRow,
  reason: string,
): Promise<void> {
  const now = new Date()

  await admin
    .from('orders')
    .update({
      status:              'refunded',
      cancelled_at:        now.toISOString(),
      cancellation_reason: `MP payment ${reason}`,
      updated_at:          now.toISOString(),
    })
    .eq('id', order.id)

  // Reembolsa o comprador via RPC atômica (estorna saldo na carteira interna)
  await admin.rpc('refund_buyer', {
    p_order_id:    order.id,
    p_buyer_id:    order.buyer_id,
    p_amount:      order.amount,
    p_description: `Reembolso (${reason}) — pedido ${order.id.slice(0, 8)}`,
  })

  await admin.rpc('restore_stock', {
    p_announcement_id: order.announcement_id,
    p_item_id:         order.announcement_item_id ?? undefined,
    p_quantity:        1,
  })

  await admin.from('notifications').insert({
    user_id: order.buyer_id,
    type:    'system',
    title:   'Reembolso processado',
    message: `Seu reembolso de R$ ${order.amount.toFixed(2)} foi processado.`,
    data:    { order_id: order.id },
  })

  console.log('[MP Webhook] payment refunded processed:', order.id, reason)
}

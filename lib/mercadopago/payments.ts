/**
 * lib/mercadopago/payments.ts
 *
 * Cobranças via Mercado Pago (PIX, Boleto, Cartão), refund e consulta de status.
 *
 * Modelo: pagamento DIRETO com application_fee. O split de receita é feito
 * internamente em wallet_transactions. Quando houver volume, migrar para o
 * modelo Marketplace OAuth (vendedor conecta sua conta MP via OAuth).
 *
 * Não importar este módulo em código client.
 */

import { Payment, PaymentRefund } from 'mercadopago'
import { mp } from '@/lib/mercadopago/client'
import type {
  MPCreatePaymentParams,
  MPPaymentResult,
  MPPaymentStatus,
} from '@/lib/mercadopago/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_STATUSES: ReadonlyArray<MPPaymentStatus> = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
  'in_process',
]

function normalizeStatus(raw: string | undefined): MPPaymentStatus {
  if (raw && (VALID_STATUSES as ReadonlyArray<string>).includes(raw)) {
    return raw as MPPaymentStatus
  }
  return 'pending'
}

function requireString(value: string | number | undefined, field: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`[MP] resposta inválida: campo "${field}" ausente.`)
  }
  return String(value)
}

interface MPLikeError {
  message?: string
  cause?: unknown
}

function rethrow(action: string, err: unknown): never {
  const e = err as MPLikeError
  const message = e?.message ?? 'erro desconhecido'
  let causeStr = ''
  try {
    causeStr = JSON.stringify(e?.cause ?? null)
  } catch {
    causeStr = String(e?.cause)
  }
  throw new Error(`[MP] ${action} falhou: ${message} | cause: ${causeStr}`)
}

const paymentClient = new Payment(mp)
const refundClient  = new PaymentRefund(mp)

// ─── 1) PIX ──────────────────────────────────────────────────────────────────

export async function createPixPayment(
  params: MPCreatePaymentParams,
): Promise<MPPaymentResult> {
  try {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30min
    const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kkmarket.com.br'}/api/webhooks/mercadopago`

    const payment = await paymentClient.create({
      body: {
        transaction_amount: params.amount,
        payment_method_id:  'pix',
        payer:              { email: params.buyerEmail },
        description:        params.description,
        external_reference: params.orderId,
        date_of_expiration: expiresAt,
        notification_url:   notificationUrl,
      },
    })

    const poi    = payment.point_of_interaction
    const txData = poi?.transaction_data

    return {
      id:               requireString(payment.id, 'id'),
      status:           normalizeStatus(payment.status),
      pixQrCode:        txData?.qr_code,
      pixQrCodeBase64:  txData?.qr_code_base64,
      pixExpiration:    payment.date_of_expiration ?? expiresAt,
    }
  } catch (err: unknown) {
    rethrow('createPixPayment', err)
  }
}

// ─── 2) Boleto (bolbradesco) ─────────────────────────────────────────────────

function nextBusinessDayEnd(): string {
  // Amanhã às 23:59 (horário local do servidor). Para fins fiscais o MP
  // considera o vencimento na timezone enviada na string ISO.
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

export async function createBoletoPayment(
  params: MPCreatePaymentParams,
): Promise<MPPaymentResult> {
  if (!params.buyerFirstName || !params.buyerLastName || !params.buyerCpf) {
    throw new Error(
      '[MP] createBoletoPayment requer buyerFirstName, buyerLastName e buyerCpf.',
    )
  }

  try {
    const expiresAt = nextBusinessDayEnd()

    const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kkmarket.com.br'}/api/webhooks/mercadopago`

    const payment = await paymentClient.create({
      body: {
        transaction_amount: params.amount,
        payment_method_id:  'bolbradesco',
        description:        params.description,
        external_reference: params.orderId,
        date_of_expiration: expiresAt,
        notification_url:   notificationUrl,
        payer: {
          email:      params.buyerEmail,
          first_name: params.buyerFirstName,
          last_name:  params.buyerLastName,
          identification: {
            type:   'CPF',
            number: params.buyerCpf.replace(/\D/g, ''),
          },
        },
      },
    })

    return {
      id:                requireString(payment.id, 'id'),
      status:            normalizeStatus(payment.status),
      boletoUrl:         payment.transaction_details?.external_resource_url,
      boletoBarcode:     payment.transaction_details?.barcode?.content,
      boletoExpiration:  payment.date_of_expiration ?? expiresAt,
    }
  } catch (err: unknown) {
    rethrow('createBoletoPayment', err)
  }
}

// ─── 3) Cartão de Crédito ────────────────────────────────────────────────────

export async function createCreditCardPayment(
  params: MPCreatePaymentParams,
): Promise<MPPaymentResult> {
  if (!params.cardToken) {
    throw new Error('[MP] createCreditCardPayment requer cardToken.')
  }

  try {
    const notificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://kkmarket.com.br'}/api/webhooks/mercadopago`

    const payment = await paymentClient.create({
      body: {
        transaction_amount: params.amount,
        token:              params.cardToken,
        installments:       params.installments ?? 1,
        description:        params.description,
        external_reference: params.orderId,
        notification_url:   notificationUrl,
        payer:              { email: params.buyerEmail },
      },
    })

    return {
      id:     requireString(payment.id, 'id'),
      status: normalizeStatus(payment.status),
    }
  } catch (err: unknown) {
    rethrow('createCreditCardPayment', err)
  }
}

// ─── 4) Refund ───────────────────────────────────────────────────────────────

export async function refundPayment(
  mpPaymentId: string,
  amount?: number,
): Promise<void> {
  try {
    await refundClient.create({
      payment_id: mpPaymentId,
      body: amount !== undefined ? { amount } : undefined,
    })
  } catch (err: unknown) {
    rethrow('refundPayment', err)
  }
}

// ─── 5) Consulta de status ───────────────────────────────────────────────────

export async function getPaymentStatus(
  mpPaymentId: string,
): Promise<MPPaymentStatus> {
  try {
    const payment = await paymentClient.get({ id: mpPaymentId })
    return normalizeStatus(payment.status)
  } catch (err: unknown) {
    rethrow('getPaymentStatus', err)
  }
}

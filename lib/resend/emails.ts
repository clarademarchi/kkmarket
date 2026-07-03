/**
 * lib/resend/emails.ts
 *
 * E-mails transacionais via Resend (RESEND_API_KEY na Vercel).
 * Em dev, faz log se a chave não estiver configurada.
 */

import { getResendClient, RESEND_FROM, SITE_URL } from '@/lib/resend/client'
import { emailLayout } from '@/lib/resend/template'

async function send(payload: { to: string; subject: string; html: string }) {
  const client = getResendClient()
  if (!client) {
    console.log('[resend] RESEND_API_KEY não configurada — e-mail ignorado:', payload.subject, '→', payload.to)
    return false
  }

  const { error } = await client.emails.send({
    from: RESEND_FROM,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  })

  if (error) {
    console.error('[resend] falha ao enviar:', payload.subject, error)
    return false
  }

  return true
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Moderação de anúncios ───────────────────────────────────────────────────

interface AnnouncementApprovedParams {
  to: string
  name: string
  title: string
  slug: string
}

interface AnnouncementRejectedParams {
  to: string
  name: string
  title: string
  reason: string
}

export async function sendAnnouncementApproved(params: AnnouncementApprovedParams) {
  await send({
    to: params.to,
    subject: `✅ Seu anúncio foi aprovado — ${params.title}`,
    html: emailLayout({
      title: 'Anúncio aprovado!',
      preheader: `Seu anúncio "${params.title}" já está visível na plataforma.`,
      body: `
        <p>Olá, <strong>${params.name}</strong>!</p>
        <p>Seu anúncio <strong>${params.title}</strong> foi aprovado e já está disponível para compradores.</p>
      `,
      cta: { label: 'Ver anúncio', href: `${SITE_URL}/anuncio/${params.slug}` },
    }),
  })
}

export async function sendAnnouncementRejected(params: AnnouncementRejectedParams) {
  await send({
    to: params.to,
    subject: `❌ Anúncio precisa de revisão — ${params.title}`,
    html: emailLayout({
      title: 'Anúncio não aprovado',
      body: `
        <p>Olá, <strong>${params.name}</strong>.</p>
        <p>Seu anúncio <strong>${params.title}</strong> não pôde ser aprovado pelo seguinte motivo:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #fb7185;background:rgba(251,113,133,0.08);color:#dde2f8;border-radius:0 8px 8px 0">
          ${params.reason}
        </blockquote>
        <p>Corrija o anúncio e reenvie quando estiver pronto.</p>
      `,
      cta: { label: 'Ir para Meus Anúncios', href: `${SITE_URL}/meus-anuncios` },
    }),
  })
}

// ─── Conta criada ────────────────────────────────────────────────────────────

interface WelcomeEmailParams {
  to: string
  username: string
}

export async function sendWelcomeEmail(params: WelcomeEmailParams) {
  await send({
    to: params.to,
    subject: '🎮 Bem-vindo ao KKmarket — sua conta foi criada!',
    html: emailLayout({
      title: `Bem-vindo, @${params.username}!`,
      preheader: 'Sua conta KKmarket foi criada com sucesso.',
      body: `
        <p>Estamos felizes em ter você na arena digital da KKmarket.</p>
        <p><strong>Próximos passos:</strong></p>
        <ul style="padding-left:20px;margin:12px 0">
          <li>Confirme seu e-mail pelo link que enviamos (se ainda não confirmou)</li>
          <li>Explore categorias de jogos, bots e scripts</li>
          <li>Ganhe pontos com login diário e missões</li>
        </ul>
        <p>Compras têm pagamento protegido e entrega garantida pela plataforma.</p>
      `,
      cta: { label: 'Explorar marketplace', href: SITE_URL },
      footerNote: 'Se você não criou esta conta, ignore este e-mail.',
    }),
  })
}

// ─── Compra confirmada ───────────────────────────────────────────────────────

interface PurchaseConfirmedParams {
  to: string
  buyerName: string
  productTitle: string
  amount: number
  orderId: string
  hasAutoDelivery: boolean
}

export async function sendPurchaseConfirmedEmail(params: PurchaseConfirmedParams) {
  const shortId = params.orderId.slice(0, 8).toUpperCase()

  await send({
    to: params.to,
    subject: `✅ Pagamento confirmado — ${params.productTitle}`,
    html: emailLayout({
      title: 'Pagamento confirmado!',
      preheader: `Seu pagamento de ${brl(params.amount)} foi confirmado.`,
      body: `
        <p>Olá, <strong>${params.buyerName}</strong>!</p>
        <p>Recebemos seu pagamento e seu pedido já está em andamento.</p>
        <table style="width:100%;margin:20px 0;border-collapse:collapse">
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px">Pedido</td>
            <td style="padding:10px 0;color:#dde2f8;font-size:13px;text-align:right;font-weight:700">#${shortId}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px;border-top:1px solid rgba(255,255,255,0.06)">Produto</td>
            <td style="padding:10px 0;color:#dde2f8;font-size:13px;text-align:right;border-top:1px solid rgba(255,255,255,0.06)">${params.productTitle}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px;border-top:1px solid rgba(255,255,255,0.06)">Valor pago</td>
            <td style="padding:10px 0;color:#4cd7f6;font-size:15px;text-align:right;font-weight:800;border-top:1px solid rgba(255,255,255,0.06)">${brl(params.amount)}</td>
          </tr>
        </table>
        <p>${
          params.hasAutoDelivery
            ? '⚡ Este produto possui <strong>entrega automática</strong>. Você receberá o código de ativação em um e-mail separado.'
            : 'O vendedor foi notificado e realizará a entrega pelo chat do pedido.'
        }</p>
      `,
      cta: { label: 'Acompanhar pedido', href: `${SITE_URL}/minhas-compras` },
    }),
  })
}

// ─── Código de entrega automática ────────────────────────────────────────────

interface AutoDeliveryEmailParams {
  to: string
  buyerName: string
  productTitle: string
  activationCode: string
  orderId: string
}

export async function sendAutoDeliveryEmail(params: AutoDeliveryEmailParams) {
  const shortId = params.orderId.slice(0, 8).toUpperCase()
  const escapedCode = params.activationCode
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  await send({
    to: params.to,
    subject: `🔑 Seu código de ativação — ${params.productTitle}`,
    html: emailLayout({
      title: 'Entrega automática concluída',
      preheader: 'Seu código de ativação está pronto para uso.',
      body: `
        <p>Olá, <strong>${params.buyerName}</strong>!</p>
        <p>Seu produto <strong>${params.productTitle}</strong> (pedido #${shortId}) foi entregue automaticamente.</p>
        <p style="margin:20px 0 8px;font-size:12px;color:#869397;text-transform:uppercase;letter-spacing:0.08em">Código / credencial</p>
        <div style="background:#0d1322;border:1px dashed rgba(76,215,246,0.4);border-radius:12px;padding:20px;font-family:monospace;font-size:14px;line-height:1.6;color:#4cd7f6;word-break:break-all;white-space:pre-wrap">${escapedCode}</div>
        <p style="margin-top:20px;font-size:13px;color:#869397">
          🔒 Guarde este código em local seguro. Não compartilhe com terceiros.
          Você também pode consultá-lo no chat do pedido na plataforma.
        </p>
      `,
      cta: { label: 'Abrir chat do pedido', href: `${SITE_URL}/chat/${params.orderId}` },
      footerNote: 'Se você não reconhece esta compra, entre em contato com o suporte imediatamente.',
    }),
  })
}

// ─── Nova Venda (Vendedor) ───────────────────────────────────────────────────

interface SellerNewOrderParams {
  to: string
  sellerName: string
  productTitle: string
  amount: number
  orderId: string
  hasAutoDelivery: boolean
}

export async function sendSellerNewOrderEmail(params: SellerNewOrderParams) {
  const shortId = params.orderId.slice(0, 8).toUpperCase()

  await send({
    to: params.to,
    subject: `🎉 Nova venda realizada! — ${params.productTitle}`,
    html: emailLayout({
      title: 'Você fez uma venda!',
      preheader: `Sua venda de ${brl(params.amount)} foi confirmada.`,
      body: `
        <p>Olá, <strong>${params.sellerName}</strong>!</p>
        <p>O pagamento do comprador foi aprovado. <strong>Sua venda está confirmada!</strong></p>
        <table style="width:100%;margin:20px 0;border-collapse:collapse">
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px">Pedido</td>
            <td style="padding:10px 0;color:#dde2f8;font-size:13px;text-align:right;font-weight:700">#${shortId}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px;border-top:1px solid rgba(255,255,255,0.06)">Produto</td>
            <td style="padding:10px 0;color:#dde2f8;font-size:13px;text-align:right;border-top:1px solid rgba(255,255,255,0.06)">${params.productTitle}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#869397;font-size:13px;border-top:1px solid rgba(255,255,255,0.06)">Valor líquido</td>
            <td style="padding:10px 0;color:#10b981;font-size:15px;text-align:right;font-weight:800;border-top:1px solid rgba(255,255,255,0.06)">${brl(params.amount)}</td>
          </tr>
        </table>
        <p>${
          params.hasAutoDelivery
            ? '⚡ Como o produto tem <strong>entrega automática</strong>, o código já foi enviado para o comprador. Não é necessário enviar manualmente!'
            : 'Acesse o painel para combinar a entrega pelo chat do pedido com o comprador.'
        }</p>
      `,
      cta: { label: 'Acessar minhas vendas', href: `${SITE_URL}/painel/vendas` },
    }),
  })
}


import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'KKmarket — Compre e Venda Produtos Digitais de Games',
    template: '%s | KKmarket',
  },
  description:
    'Marketplace confiável para compra e venda de contas, itens, gold e serviços de jogos digitais. Entrega garantida e pagamento seguro.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kkmarket.com.br'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${outfit.variable} ${jetbrainsMono.variable} min-h-screen antialiased bg-background text-foreground overflow-x-hidden font-sans`}>
        {children}
        <Toaster position="bottom-right" richColors />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </body>
    </html>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeft,
  LayoutDashboard,
  Megaphone,
  ShoppingBag,
  TrendingUp,
  Banknote,
  Bell,
  Heart,
  Settings,
  ShieldCheck,
  Coins,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/painel',           label: 'Painel',           icon: LayoutDashboard },
  { href: '/painel/mensagens', label: 'Mensagens',        icon: MessageSquare },
  { href: '/meus-anuncios',    label: 'Meus anúncios',    icon: Megaphone },
  { href: '/minhas-compras',   label: 'Minhas compras',   icon: ShoppingBag },
  { href: '/minhas-vendas',    label: 'Minhas vendas',    icon: TrendingUp },
  { href: '/minhas-retiradas', label: 'Retiradas',        icon: Banknote },
  { href: '/kks-points',        label: 'KKs Points',        icon: Coins },
  { href: '/wishlist',         label: 'Lista de desejos', icon: Heart },
  { href: '/notificacoes',     label: 'Notificações',     icon: Bell },
  { href: '/verificacao',      label: 'Verificação',      icon: ShieldCheck },
  { href: '/configuracoes',    label: 'Configurações',    icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 min-h-screen sticky top-16 h-[calc(100vh-4rem)]">
      {/* Back button */}
      <div className="p-3 border-b border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao início
        </Link>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/painel'
                ? pathname === '/painel'
                : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

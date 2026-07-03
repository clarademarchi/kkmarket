'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  User, LayoutDashboard, ShoppingBag, Store, PlusCircle,
  Settings, LogOut, Shield, ChevronDown, MessageSquare,
} from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import { useTransition } from 'react'

export interface UserDropdownProps {
  displayName: string
  username: string
  email: string
  avatarUrl: string | null
  role: string
  sellerStatus: string
  isOnline: boolean
}

export function UserDropdown({
  displayName,
  username,
  email,
  avatarUrl,
  role,
  sellerStatus,
  isOnline,
}: UserDropdownProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Fecha com Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function close() { setOpen(false) }

  function handleLogout() {
    close()
    startTransition(async () => { await signOutAction() })
  }

  const roleLabel =
    role === 'admin' ? 'Admin' :
    role === 'moderator' ? 'Moderador' : 'Cliente'

  const initials = displayName[0]?.toUpperCase() ?? '?'

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-2 rounded-full px-1 py-1 outline-none ring-offset-zinc-950 transition-all focus-visible:ring-2 focus-visible:ring-violet-500 hover:bg-zinc-800/60"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {/* Avatar */}
        <div className="relative">
          <div className="h-9 w-9 overflow-hidden rounded-full border border-zinc-800 transition-colors group-hover:border-zinc-700 bg-violet-600 flex items-center justify-center text-sm font-bold text-white">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-950 bg-green-500" />
          )}
        </div>

        {/* Texto (desktop) */}
        <div className="hidden lg:flex flex-col items-start gap-0.5 text-left">
          <span className="max-w-[100px] truncate text-sm font-semibold text-zinc-200 group-hover:text-white">
            {displayName}
          </span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
            {roleLabel}
          </span>
        </div>
        <ChevronDown className={`hidden lg:block h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/40 z-50 overflow-hidden"
          role="menu"
        >
          {/* Header do usuário */}
          <div className="px-3 py-3 border-b border-zinc-800/60">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <p className="text-xs text-zinc-500 truncate">{email}</p>
          </div>

          {/* Links */}
          <div className="p-1.5 flex flex-col gap-0.5">
            <MenuItem href={`/perfil/${username}`} icon={<User className="h-4 w-4" />} onClick={close}>
              Meu Perfil
            </MenuItem>
            <MenuItem href="/painel" icon={<LayoutDashboard className="h-4 w-4" />} onClick={close}>
              Painel
            </MenuItem>
            <MenuItem href="/painel/mensagens" icon={<MessageSquare className="h-4 w-4" />} onClick={close}>
              Mensagens
            </MenuItem>
            <MenuItem href="/minhas-compras" icon={<ShoppingBag className="h-4 w-4" />} onClick={close}>
              Minhas Compras
            </MenuItem>
            <MenuItem href="/minhas-vendas" icon={<Store className="h-4 w-4" />} onClick={close}>
              Minhas Vendas
            </MenuItem>
            <MenuItem
              href={sellerStatus === 'approved' ? '/meus-anuncios/novo' : '/verificacao'}
              icon={<PlusCircle className="h-4 w-4" />}
              onClick={close}
            >
              {sellerStatus === 'approved' ? 'Criar Anúncio' : 'Quero Vender'}
            </MenuItem>
            <MenuItem href="/configuracoes" icon={<Settings className="h-4 w-4" />} onClick={close}>
              Configurações
            </MenuItem>

            {(role === 'admin' || role === 'moderator') && (
              <>
                <div className="my-1 h-px bg-zinc-800/60" />
                <MenuItem href="/admin" icon={<Shield className="h-4 w-4 text-violet-400" />} onClick={close} highlight>
                  Área Admin
                </MenuItem>
              </>
            )}
          </div>

          {/* Logout */}
          <div className="p-1.5 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isPending}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              role="menuitem"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isPending ? 'Saindo…' : 'Sair da conta'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Item auxiliar ────────────────────────────────────────────────────────────
function MenuItem({
  href,
  icon,
  children,
  onClick,
  highlight,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors ${
        highlight
          ? 'text-violet-400 hover:bg-violet-500/10 hover:text-violet-300'
          : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
      }`}
      role="menuitem"
    >
      {icon}
      {children}
    </Link>
  )
}

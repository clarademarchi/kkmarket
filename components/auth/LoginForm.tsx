'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  loginAction,
  forgotPasswordAction,
  getOAuthUrlAction,
  type LoginFormState,
} from '@/app/actions/auth'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

import { createClient } from '@/lib/supabase/client'

export function LoginForm({ dict }: { dict: any }) {
  const t = dict.auth.login
  const [state, action, pending] = useActionState<LoginFormState, FormData>(loginAction, null)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotState, forgotAction, forgotPending] = useActionState<{ message?: string } | null, FormData>(
    forgotPasswordAction,
    null,
  )
  const [oauthLoading, setOauthLoading] = useState<'google' | 'discord' | null>(null)

  const forgotMsg = forgotState?.message
  const forgotIsSuccess = forgotMsg?.startsWith('success:')
  const forgotText = forgotMsg?.replace(/^(success:|error:)/, '')

  async function handleOAuth(provider: 'google' | 'discord') {
    try {
      setOauthLoading(provider)
      const res = await getOAuthUrlAction(provider)
      if (res?.error) {
        console.error(res.error)
        setOauthLoading(null)
      } else if (res?.url) {
        window.location.assign(res.url)
      }
    } catch (err) {
      console.error(err)
      setOauthLoading(null)
    }
  }

  const inputCls = "w-full rounded-lg border border-[var(--gm-ink-faint)]/50 bg-[var(--gm-paper-3)] px-4 py-3 text-sm text-[var(--gm-ink)] placeholder-[var(--gm-ink-faint)] outline-none transition-all focus:border-[var(--gm-violet)] focus:ring-2 focus:ring-[var(--gm-violet)]/20 aria-[invalid]:border-[var(--gm-rose)]"

  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-[var(--gm-ink)]">
          {t.title}
        </h1>
        <p className="mt-2 text-sm text-[var(--gm-ink-dim)]">
          {t.newUser}{' '}
          <Link href="/cadastro" className="text-[var(--gm-violet)] hover:text-[var(--gm-cyan)] font-semibold transition-colors">
            {t.createAccount}
          </Link>
        </p>
      </div>

      <div className="mb-6">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={!!oauthLoading || pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--gm-ink-faint)]/50 bg-[var(--gm-paper-3)] px-4 py-3 text-sm font-semibold text-[var(--gm-ink)] transition-all hover:border-[var(--gm-violet)]/50 hover:bg-[var(--gm-violet)]/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {oauthLoading === 'google' ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gm-ink-faint)] border-t-[var(--gm-violet)]" />
          ) : (
            <GoogleIcon />
          )}
          Google
        </button>
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--gm-ink-faint)]/30" />
        </div>
        <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
          <span className="bg-[var(--gm-paper)] px-3 text-[var(--gm-ink-faint)]">{t.orContinueEmail}</span>
        </div>
      </div>

      {!showForgot ? (
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold uppercase tracking-wide text-[var(--gm-ink-dim)] mb-1.5">
              {t.emailLabel}
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="player@gamemarket.app"
              className={inputCls}
              aria-invalid={!!state?.errors?.email}
              aria-describedby={state?.errors?.email ? 'login-email-error' : undefined}
            />
            {state?.errors?.email && (
              <p id="login-email-error" className="mt-1.5 text-xs text-[var(--gm-rose)]">
                {state.errors.email[0]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-bold uppercase tracking-wide text-[var(--gm-ink-dim)] mb-1.5">
              {t.passwordLabel}
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className={inputCls}
              aria-invalid={!!state?.errors?.password}
              aria-describedby={state?.errors?.password ? 'login-password-error' : undefined}
            />
            {state?.errors?.password && (
              <p id="login-password-error" className="mt-1.5 text-xs text-[var(--gm-rose)]">
                {state.errors.password[0]}
              </p>
            )}
          </div>

          {state?.message && (
            <div className="rounded-lg border border-[var(--gm-rose)]/30 bg-[var(--gm-rose)]/10 px-4 py-3 text-sm text-[var(--gm-rose)]">
              {state.message}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-xs text-[var(--gm-ink-faint)] hover:text-[var(--gm-violet)] transition-colors"
            >
              {t.forgotPassword}
            </button>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="relative w-full rounded-lg bg-[var(--gm-violet)] px-4 py-3 text-sm font-black text-[#1a1126] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed gm-glow"
            aria-busy={pending}
          >
            {pending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1126]/30 border-t-[#1a1126]" />
                {t.submitting}
              </span>
            ) : (
              t.submit
            )}
          </button>
        </form>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setShowForgot(false)}
            className="mb-4 flex items-center gap-1.5 text-sm text-[var(--gm-ink-dim)] hover:text-[var(--gm-ink)] transition-colors"
          >
            {t.backToLogin}
          </button>
          <h2 className="text-lg font-black text-[var(--gm-ink)] mb-1">{t.recoverTitle}</h2>
          <p className="text-sm text-[var(--gm-ink-dim)] mb-4">
            {t.recoverDesc}
          </p>
          <form action={forgotAction} className="space-y-4">
            <input
              name="email"
              type="email"
              required
              placeholder={t.emailPlaceholder}
              className={inputCls}
            />
            {forgotMsg && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  forgotIsSuccess
                    ? 'border-[var(--gm-green)]/30 bg-[var(--gm-green)]/10 text-[var(--gm-green)]'
                    : 'border-[var(--gm-rose)]/30 bg-[var(--gm-rose)]/10 text-[var(--gm-rose)]'
                }`}
              >
                {forgotText}
              </div>
            )}
            <button
              type="submit"
              disabled={forgotPending}
              className="w-full rounded-lg bg-[var(--gm-violet)] px-4 py-3 text-sm font-black text-[#1a1126] transition-all hover:opacity-90 disabled:opacity-60"
            >
              {forgotPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1126]/30 border-t-[#1a1126]" />
                  {t.sending}
                </span>
              ) : (
                t.sendInstructions
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

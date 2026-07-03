'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, registerSchema } from '@/lib/validations/auth'
import { sendWelcomeEmail } from '@/lib/resend/emails'

export type LoginFormState = {
  errors?: { email?: string[]; password?: string[] }
  message?: string
} | null

export type RegisterFormState = {
  errors?: {
    username?: string[]
    email?: string[]
    password?: string[]
    confirmPassword?: string[]
  }
  message?: string
} | null

// ─── Server Actions ─────────────────────────────────────────────────────────

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { message: 'E-mail ou senha incorretos.' }
  }

  redirect('/')
}

export async function registerAction(
  _prevState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const parsed = registerSchema.safeParse({
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  // Verificar disponibilidade do username
  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', parsed.data.username.toLowerCase())
    .maybeSingle()

  if (existing) {
    return { errors: { username: ['Este username já está em uso.'] } }
  }

  const origin = (await headers()).get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username.toLowerCase() },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { errors: { email: ['Este e-mail já está cadastrado.'] } }
    }
    return { message: 'Erro ao criar conta. Tente novamente.' }
  }

  // Credit 50 welcome points atomically to the new user stats and transaction logs.
  if (data?.user) {
    const { error: pointsError } = await supabase.rpc('credit_points', {
      p_user_id: data.user.id,
      p_amount: 50,
      p_type: 'event',
      p_expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days expiration
      p_description: 'Bônus de boas-vindas'
    })
    if (pointsError) {
      console.error('[registerAction] Failed to credit 50 welcome points:', pointsError)
    } else {
      console.log('[registerAction] 50 welcome points successfully credited to:', data.user.id)
    }
  }

  void sendWelcomeEmail({
    to: parsed.data.email,
    username: parsed.data.username.toLowerCase(),
  }).catch((err) => console.error('[registerAction] welcome email failed:', err))

  return {
    message:
      'success:Conta criada! Verifique seu e-mail para ativar sua conta (seus 50 pontos de boas-vindas já foram creditados).',
  }
}

export async function forgotPasswordAction(
  _prevState: { message?: string } | null,
  formData: FormData,
): Promise<{ message?: string } | null> {
  const email = formData.get('email')?.toString().trim()

  if (!email || !z.string().email().safeParse(email).success) {
    return { message: 'error:Informe um e-mail válido.' }
  }

  const supabase = await createClient()
  const origin = (await headers()).get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/nova-senha`,
  })

  // Sempre retorna sucesso para não revelar se o e-mail existe
  return { message: 'success:Se este e-mail estiver cadastrado, você receberá as instruções em breve.' }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function signInWithOAuthAction(provider: 'google' | 'discord') {
  const supabase = await createClient()
  const origin = (await headers()).get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://kkmarket.com.br'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: provider === 'google' ? 'openid email profile' : undefined,
    },
  })

  if (error || !data.url) {
    return { error: 'Erro ao iniciar login social.' }
  }

  redirect(data.url)
}

// ─── Completa perfil de usuário OAuth (username definitivo) ──────────────────

export type CompleteProfileState = { error?: string } | null

export async function completeProfileAction(
  _prevState: CompleteProfileState,
  formData: FormData,
): Promise<CompleteProfileState> {
  const username = formData.get('username')?.toString().trim().toLowerCase() ?? ''

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return { error: 'Username deve ter 3–30 caracteres (letras, números e _).' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('profiles')
    .update({ username, onboarding_complete: true, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Este username já está em uso. Escolha outro.' }
    }
    return { error: 'Erro ao salvar. Tente novamente.' }
  }

  if (user.email) {
    void sendWelcomeEmail({
      to: user.email,
      username,
    }).catch((err) => console.error('[completeProfileAction] welcome email failed:', err))
  }

  redirect('/')
}

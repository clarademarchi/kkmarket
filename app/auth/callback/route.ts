import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Obter o usuário atualizado da sessão
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Check if the user already has the welcome points transaction
        const { data: hasBonus } = await supabase
          .from('points_transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('description', 'Bônus de boas-vindas')
          .maybeSingle()

        if (!hasBonus) {
          const { error: pointsError } = await supabase.rpc('credit_points', {
            p_user_id: user.id,
            p_amount: 50,
            p_type: 'event',
            p_expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            p_description: 'Bônus de boas-vindas'
          })
          if (pointsError) {
            console.error('[OAuth callback] Failed to credit welcome points:', pointsError)
          } else {
            console.log('[OAuth callback] 50 welcome points credited successfully to:', user.id)
          }
        }

        // Verificar se completou o onboarding
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .maybeSingle()

        if (profile && !profile.onboarding_complete) {
          // Se for login OAuth novo com onboarding incompleto, envia para /completar-perfil
          return NextResponse.redirect(new URL('/completar-perfil', request.url))
        }
      }

      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Em caso de erro, redireciona de volta para o login com parâmetro de erro
  return NextResponse.redirect(new URL('/login?error=auth-code-error', request.url))
}

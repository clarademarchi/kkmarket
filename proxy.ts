import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Fix para falhas de Redirect URL do Supabase OAUTH.
  // Se o Supabase mandar o código PKCE para a rota errada (ex: página inicial /?code=UUID), 
  // nós o capturamos e redirecionamos forçadamente para a rota de callback oficial
  // preservando a lógica de onboarding e bônus.
  const code = request.nextUrl.searchParams.get('code')
  if (code && request.nextUrl.pathname !== '/auth/callback') {
    // Verifica se o code se parece com o formato UUID gerado pelo Supabase PKCE
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
      const callbackUrl = request.nextUrl.clone()
      callbackUrl.pathname = '/auth/callback'
      return NextResponse.redirect(callbackUrl)
    }
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user) {
    if (
      pathname.startsWith('/painel') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/api/withdrawals')
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  } else {
    // Verificação de role para /admin
    if (pathname.startsWith('/admin')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || (profile.role !== 'admin' && profile.role !== 'moderator')) {
        const url = request.nextUrl.clone()
        url.pathname = '/painel'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

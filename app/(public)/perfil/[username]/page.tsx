import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Settings, Star, Package, Zap, Check, Mail, Smartphone, IdCard, Wallet, Trophy, Diamond, Flame, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProfileReviewTabs } from '@/components/profile/ProfileReviewTabs'
import { ProfileActions } from '@/components/profile/ProfileActions'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username, bio')
    .eq('username', username)
    .single()
  if (!data) return { title: 'Perfil não encontrado' }
  return {
    title: `${data.display_name ?? data.username} | KKmarket`,
    description: data.bio ?? `Perfil de ${data.display_name ?? data.username} no KKmarket.`,
  }
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = await createClient()

  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id, username, display_name, avatar_url, bio, role, is_vip, created_at,
      user_stats!user_id (
        total_sales, total_purchases,
        reviews_positive, reviews_neutral, reviews_negative,
        avg_response_time_minutes
      ),
      user_validations ( type, status )
    `)
    .eq('username', username)
    .eq('status', 'active')
    .single()

  if (!profile) notFound()

  const isOwner = currentUser?.id === profile.id

  const stats = profile.user_stats as unknown as {
    total_sales: number
    total_purchases: number
    reviews_positive: number
    reviews_neutral: number
    reviews_negative: number
    avg_response_time_minutes: number | null
  } | null

  // Fetch announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, slug, unit_price, has_auto_delivery, sale_count, announcement_images(url, is_cover, sort_order)')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    .order('sale_count', { ascending: false })
    .limit(7)

  const { data: initialReviews } = await supabase
    .from('order_reviews')
    .select(
      'id, reviewer_id, type, message, created_at, role, profiles!reviewer_id(username, display_name, avatar_url)',
    )
    .eq('reviewed_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const verifications = (profile.user_validations as { type: string; status: string }[] ?? [])
    .filter((v) => v.status === 'verified')
  const hasEmail    = verifications.some((v) => v.type === 'email')
  const hasPhone    = verifications.some((v) => v.type === 'phone')
  const hasIdentity = verifications.some((v) => ['identity_front', 'identity_back'].includes(v.type))

  const displayName = profile.display_name ?? profile.username
  const joinYear    = new Date(profile.created_at).getFullYear()

  const totalSales = stats?.total_sales ?? 0
  const totalReviews = (stats?.reviews_positive ?? 0) + (stats?.reviews_neutral ?? 0) + (stats?.reviews_negative ?? 0)
  const positiveRatio = totalReviews > 0
    ? Math.round(((stats?.reviews_positive ?? 0) / totalReviews) * 100)
    : null

  // Derive level from total_sales
  const level = Math.max(1, Math.floor(totalSales / 10) + 1)
  const xpPct = (totalSales % 10) * 10

  const respTime = stats?.avg_response_time_minutes
  const respLabel = respTime == null ? '—'
    : respTime < 60 ? `${respTime}min`
    : `${Math.round(respTime / 60)}h`

  const badges = [
    hasEmail && <Mail className="h-4 w-4" />,
    hasPhone && <Smartphone className="h-4 w-4" />,
    hasIdentity && <IdCard className="h-4 w-4" />,
    profile.is_vip && <Star className="h-4 w-4 text-[var(--gm-amber)]" />,
    profile.role === 'seller' && <Wallet className="h-4 w-4 text-[var(--gm-green)]" />,
    totalSales >= 50 && <Trophy className="h-4 w-4 text-[var(--gm-amber)]" />,
    totalSales >= 100 && <Diamond className="h-4 w-4 text-[var(--gm-violet)]" />,
    (stats?.reviews_positive ?? 0) >= 10 && <Flame className="h-4 w-4 text-[var(--gm-amber)]" />,
    (stats?.reviews_positive ?? 0) >= 50 && <Target className="h-4 w-4 text-[var(--gm-violet)]" />,
  ].filter(Boolean) as React.ReactNode[]

  const anns = (announcements ?? []) as unknown as Array<{
    id: string; title: string; slug: string
    unit_price: number | null; has_auto_delivery: boolean; sale_count: number
    announcement_images: { url: string; is_cover: boolean; sort_order: number }[]
  }>

  const featured = anns[0]
  const rest = anns.slice(1, 7)

  return (
    <main className="min-h-screen text-[var(--gm-ink)]">
      <div className="container mx-auto max-w-6xl px-4 py-10">

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">

          {/* ─── Gamer Card (sticky sidebar) ─── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-[var(--gm-violet)]/30 bg-[var(--gm-paper-2)] p-5 flex flex-col gap-4"
              style={{ background: 'linear-gradient(160deg, rgba(255, 157, 0, 0.06), rgba(0, 162, 255, 0.02))' }}>

              {/* Rank chips */}
              <div className="flex items-center justify-between">
                {profile.is_vip
                  ? <span className="rank-chip gold text-[10px]">◆ DIAMANTE</span>
                  : <span className="rank-chip text-[10px]">JOGADOR</span>}
                {profile.is_vip && <span className="rank-chip gold text-[10px]">VIP</span>}
                {isOwner && (
                  <Link
                    href="/configuracoes"
                    title="Editar perfil"
                    className="ml-auto flex items-center justify-center rounded-lg p-1.5 text-[var(--gm-ink-faint)] hover:bg-[var(--gm-paper-3)] hover:text-[var(--gm-ink)] transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {/* Avatar + nome */}
              <div className="flex flex-col items-center gap-3 text-center">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={displayName}
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-[var(--gm-violet)]/50"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--gm-violet)]/20 text-2xl font-black text-[var(--gm-violet)] ring-2 ring-[var(--gm-violet)]/50 uppercase">
                    {displayName.slice(0, 2)}
                  </div>
                )}
                <div>
                  <h1 className="text-lg font-black text-[var(--gm-ink)]">{displayName}</h1>
                  <p className="text-xs text-[var(--gm-ink-faint)]">@{profile.username} · desde {joinYear}</p>
                </div>
              </div>

              {/* XP Bar */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[var(--gm-ink-faint)] shrink-0">LV {level}</span>
                <div className="xp-bar flex-1">
                  <div className="xp-bar-fill" style={{ width: `${xpPct}%` }} />
                </div>
                <span className="text-[10px] font-bold text-[var(--gm-violet)] shrink-0">{xpPct}%</span>
              </div>

              {/* Stats 2x2 */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: <Star className="h-5 w-5" />, value: positiveRatio !== null ? `${positiveRatio}%` : '—', label: 'avaliações' },
                  { icon: <Package className="h-5 w-5" />, value: String(totalSales), label: 'vendas' },
                  { icon: <Zap className="h-5 w-5" />, value: respLabel, label: 'resp.' },
                  { icon: <Check className="h-5 w-5" />,  value: `${totalReviews > 0 ? positiveRatio ?? '—' : '—'}%`, label: 'ok' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--gm-ink-faint)]/20 p-2 text-[var(--gm-ink-dim)]">
                    {s.icon}
                    <span className="text-sm font-black text-[var(--gm-ink)]">{s.value}</span>
                    <span className="text-[9px] text-[var(--gm-ink-faint)] uppercase tracking-wide">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-xs text-[var(--gm-ink-dim)] leading-relaxed text-center">{profile.bio}</p>
              )}

              {/* Verificações */}
              {(hasEmail || hasPhone || hasIdentity) && (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {hasEmail    && <span className="rank-chip text-[9px]"><Mail className="inline h-3 w-3 mr-1" /> email</span>}
                  {hasPhone    && <span className="rank-chip green text-[9px]"><Smartphone className="inline h-3 w-3 mr-1" /> tel</span>}
                  {hasIdentity && <span className="rank-chip text-[9px]"><IdCard className="inline h-3 w-3 mr-1" /> id</span>}
                </div>
              )}

              {/* Badges */}
              {badges.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--gm-ink-faint)] mb-2">Badges · {badges.length}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {badges.map((b, i) => (
                      <div key={i} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--gm-ink-faint)]/30 text-sm"
                        style={{ background: i < 3 ? 'rgba(255, 157, 0, 0.1)' : 'transparent' }}>
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA Buttons */}
              <ProfileActions username={profile.username} userId={profile.id} />
            </div>
          </aside>

          {/* ─── Content ─── */}
          <div className="flex flex-col gap-6">

            {/* Tabs */}
            <div className="flex gap-3 border-b border-[var(--gm-ink-faint)]/20 pb-3">
              <span className="text-sm font-black text-[var(--gm-violet)] border-b-2 border-[var(--gm-violet)] pb-3 -mb-3">
                anúncios · {anns.length}
              </span>
              <span className="text-sm font-bold text-[var(--gm-ink-faint)]">reviews · {totalReviews}</span>
            </div>

            {/* Featured announcement */}
            {featured && (() => {
              const cover = featured.announcement_images?.find((i) => i.is_cover) ?? featured.announcement_images?.[0]
              return (
                <div className="rounded-xl border border-[var(--gm-violet)]/20 bg-[var(--gm-paper-2)] p-4">
                  <span className="rank-chip gold text-[9px] mb-3 inline-flex">destaque do vendedor</span>
                  <Link href={`/anuncio/${featured.slug}`} className="flex gap-4 mt-2">
                    <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg bg-[var(--gm-paper-3)]">
                      {cover?.url ? (
                        <Image src={cover.url} alt={featured.title} fill sizes="176px" className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl text-[var(--gm-ink-faint)]">🎮</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <h2 className="text-base font-black text-[var(--gm-ink)] leading-snug line-clamp-2 hover:text-[var(--gm-violet)] transition-colors">
                        {featured.title}
                      </h2>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-[var(--gm-green)]">
                          {featured.unit_price != null ? `R$ ${featured.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </span>
                        {(featured.sale_count ?? 0) > 5 && (
                          <span className="rank-chip gold text-[9px]">🔥 hot</span>
                        )}
                      </div>
                      {featured.has_auto_delivery && (
                        <span className="rank-chip green text-[9px] self-start">⚡ entrega auto</span>
                      )}
                      <div className="flex gap-2 mt-auto">
                        <span className="rounded-lg bg-[var(--gm-violet)] px-3 py-1.5 text-xs font-black text-[#1a1126]">comprar</span>
                        <span className="rounded-lg border border-[var(--gm-ink-faint)]/40 px-3 py-1.5 text-xs font-bold text-[var(--gm-ink-dim)]">ver detalhes</span>
                      </div>
                    </div>
                  </Link>
                </div>
              )
            })()}

            {/* Announcements grid */}
            {rest.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rest.map((ann) => {
                  const cover = ann.announcement_images?.find((i) => i.is_cover) ?? ann.announcement_images?.[0]
                  return (
                    <Link
                      key={ann.id}
                      href={`/anuncio/${ann.slug}`}
                      className="group rounded-xl border border-[var(--gm-ink-faint)]/20 bg-[var(--gm-paper-2)] overflow-hidden hover:border-[var(--gm-violet)]/40 gm-card-tilt transition-all"
                    >
                      <div className="relative aspect-video overflow-hidden bg-[var(--gm-paper-3)]">
                        {cover?.url ? (
                          <Image src={cover.url} alt={ann.title} fill sizes="200px" className="object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl text-[var(--gm-ink-faint)]">🎮</div>
                        )}
                        {ann.has_auto_delivery && (
                          <span className="absolute top-1.5 left-1.5 rank-chip green text-[8px]">⚡</span>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-1">
                        <p className="text-xs font-semibold text-[var(--gm-ink)] line-clamp-2 group-hover:text-[var(--gm-violet)] transition-colors">{ann.title}</p>
                        <p className="text-sm font-black text-[var(--gm-green)]">
                          {ann.unit_price != null ? `R$ ${ann.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {anns.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="text-4xl">📦</span>
                <p className="text-sm text-[var(--gm-ink-faint)]">Nenhum anúncio ativo</p>
              </div>
            )}

            {/* Reviews */}
            <div className="rounded-xl border border-[var(--gm-ink-faint)]/20 bg-[var(--gm-paper-2)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wide text-[var(--gm-ink)]">
                  Avaliações
                </h2>
                <span className="text-xs text-[var(--gm-amber)]">★★★★★ {positiveRatio ?? 0}%</span>
              </div>
              <ProfileReviewTabs
                userId={profile.id}
                initialReviews={(initialReviews ?? []) as unknown as Parameters<typeof ProfileReviewTabs>[0]['initialReviews']}
                reviewsPositive={stats?.reviews_positive ?? 0}
                reviewsNeutral={stats?.reviews_neutral ?? 0}
                reviewsNegative={stats?.reviews_negative ?? 0}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

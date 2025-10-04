import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { user_wallet } = await req.json()
    if (!user_wallet || typeof user_wallet !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing user_wallet' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Fetch profile to support legacy referrals where referrer_wallet stored referral_code
    const profileRes = await admin
      .from('user_profiles')
      .select('referral_code')
      .eq('user_wallet', user_wallet)
      .single()

    const referralCode = profileRes.data?.referral_code as string | undefined

    // Run queries in parallel
    const [rewards, staked, grants, referralsWallet, referralsByCode, stakedByMyCode, groups, forfeitures] = await Promise.all([
      admin.from('staking_rewards').select('*').eq('user_wallet', user_wallet).single(),
      admin.from('staked_nfts').select('*').eq('user_wallet', user_wallet).order('created_at', { ascending: false }),
      admin.from('manual_reward_grants').select('*').eq('user_wallet', user_wallet).eq('status', 'active').or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString()),
      admin.from('referrals').select('*, staked_nfts(nft_tier)').eq('referrer_wallet', user_wallet),
      referralCode
        ? admin.from('referrals').select('*, staked_nfts(nft_tier)').eq('referrer_wallet', referralCode)
        : Promise.resolve({ data: [], error: null } as any),
      referralCode
        ? admin.from('staked_nfts').select('id, nft_tier').eq('referral_code_used', referralCode)
        : Promise.resolve({ data: [], error: null } as any),
      admin
        .from('referral_groups')
        .select('id, reward_tier, status, gamble_status, vesting_start_time, vesting_end_time')
        .eq('referrer_wallet', user_wallet)
        .in('status', ['vesting', 'claimable']),
      admin.from('forfeitures').select('id, staked_nft_id, original_staker_wallet, forfeiture_reason, forfeited_at, staked_nfts!inner(nft_tier)').eq('referrer_wallet', user_wallet).order('forfeited_at', { ascending: false })
    ])

    // Choose which referrals to return
    const walletCount = referralsWallet.data?.length || 0
    const codeCount = referralsByCode.data?.length || 0
    const finalReferrals = walletCount > 0 ? (referralsWallet.data || []) : (referralsByCode.data || [])
    const derivedReferrals = (walletCount === 0 && codeCount === 0)
      ? (stakedByMyCode.data || []).map((row: any) => ({
          id: `derived-${row.id}`,
          referrer_wallet: user_wallet,
          staked_nft_id: row.id,
          status: 'pending',
          is_mapped_to_reward: false,
          staked_nfts: { nft_tier: row.nft_tier }
        }))
      : []

    // Enrich staked items with referrer username (via referral_code_used -> user_profiles)
    let stakedEnriched = staked.data ?? []
    try {
      const codes = Array.from(new Set((staked.data ?? [])
        .map((s: any) => s.referral_code_used)
        .filter((c: any) => typeof c === 'string' && c.length > 0)))
      if (codes.length > 0) {
        const profiles = await admin
          .from('user_profiles')
          .select('user_wallet, username, referral_code')
          .in('referral_code', codes)
        const codeToProfile = new Map<string, { user_wallet: string, username: string }>()
        for (const p of (profiles.data || [])) {
          codeToProfile.set(p.referral_code, { user_wallet: p.user_wallet, username: p.username })
        }
        stakedEnriched = (staked.data || []).map((s: any) => {
          const prof = s.referral_code_used ? codeToProfile.get(s.referral_code_used) : undefined
          return {
            ...s,
            referrer_wallet: prof?.user_wallet || null,
            referrer_username: prof?.username || null,
          }
        })
      }
    } catch (_) {
      // if enrichment fails, fall back silently
    }

    const resp = {
      rewards: rewards.data ?? null,
      staked: stakedEnriched,
      grants: grants.data ?? [],
      referrals: finalReferrals.length > 0 ? finalReferrals : derivedReferrals,
      referral_groups: groups.data ?? [],
      forfeitures: forfeitures.data ?? [],
      referralDebug: {
        byWalletCount: walletCount,
        byCodeCount: codeCount,
        usedFallbackToCode: walletCount === 0 && codeCount > 0,
        referralCode: referralCode || null,
        queryWallet: user_wallet,
        stakedUsingMyCodeCount: stakedByMyCode.data?.length || 0,
        usedDerivedFromStakes: (walletCount === 0 && codeCount === 0 && (stakedByMyCode.data?.length || 0) > 0),
        derivedCount: (walletCount === 0 && codeCount === 0) ? (stakedByMyCode.data?.length || 0) : 0
      }
    }

    console.log('[dashboard] wallet:', user_wallet, 'referralCode:', referralCode, 'referrals.byWallet:', walletCount, 'byCode:', codeCount)

    return NextResponse.json({ success: true, ...resp })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}


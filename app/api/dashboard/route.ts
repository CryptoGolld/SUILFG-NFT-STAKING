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

    const [rewards, staked, grants, referrals, forfeitures] = await Promise.all([
      admin.from('staking_rewards').select('*').eq('user_wallet', user_wallet).single(),
      admin.from('staked_nfts').select('*').eq('user_wallet', user_wallet).order('created_at', { ascending: false }),
      admin.from('manual_reward_grants').select('*').eq('user_wallet', user_wallet).eq('status', 'active').or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString()),
      admin.from('referrals').select('*, staked_nfts!inner(nft_tier)').eq('referrer_wallet', user_wallet),
      admin.from('forfeitures').select('id, staked_nft_id, original_staker_wallet, forfeiture_reason, forfeited_at, staked_nfts!inner(nft_tier)').eq('referrer_wallet', user_wallet).order('forfeited_at', { ascending: false })
    ])

    const resp = {
      rewards: rewards.data ?? null,
      staked: staked.data ?? [],
      grants: grants.data ?? [],
      referrals: referrals.data ?? [],
      forfeitures: forfeitures.data ?? []
    }

    return NextResponse.json({ success: true, ...resp })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_wallet, nft_object_id, nft_tier, staking_duration_days, stake_duration_months, referral_code_used, verification_code } = body

    // Debug log to server console (shows up in Vercel logs)
    console.log('stake-nft API received:', {
      user_wallet,
      nft_object_id,
      nft_tier,
      staking_duration_days,
      stake_duration_months,
      referral_code_used,
      verification_code
    })

    // Call Supabase Edge Function
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const stakeSecret = process.env.STAKE_API_SECRET || ''

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'Server not configured: SUPABASE_URL missing' },
        { status: 500 }
      )
    }
    if (!stakeSecret) {
      return NextResponse.json(
        { error: 'Server not configured: STAKE_API_SECRET missing' },
        { status: 500 }
      )
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/stake-nft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use shared secret header to authorize backend
        'x-stake-api-secret': stakeSecret,
        // Backward-compat: include Authorization for older function versions
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}`,
      },
      body: JSON.stringify({
        user_wallet,
        nft_object_id,
        nft_tier,
        staking_duration_days,
        stake_duration_months,
        referral_code_used,
        verification_code
      })
    })
    let data: any = null
    try {
      data = await response.json()
    } catch (_) {
      // Fall back to text if not JSON
      const text = await response.text()
      data = { error: text || 'Unknown error' }
    }

    if (!response.ok || !data?.success) {
      return NextResponse.json(
        { error: data?.error || data?.message || response.statusText || 'Failed to stake NFT' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('API stake-nft error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_wallet, nft_object_id, nft_tier, staking_duration_days, stake_duration_months, referral_code_used, verification_code } = body

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

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to stake NFT' },
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

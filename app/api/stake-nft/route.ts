import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_wallet, nft_object_id, nft_tier, staking_duration_days, referral_code_used } = body

    // Call Supabase Edge Function
    const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/stake-nft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        user_wallet,
        nft_object_id,
        nft_tier,
        staking_duration_days,
        referral_code_used
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

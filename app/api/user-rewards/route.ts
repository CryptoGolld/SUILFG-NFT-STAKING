import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_wallet } = body

    if (!user_wallet) {
      return NextResponse.json(
        { error: 'Missing user_wallet parameter' },
        { status: 400 }
      )
    }

    const { data: rewards, error } = await getSupabase()
      .from('staking_rewards')
      .select('*')
      .eq('user_wallet', user_wallet)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({ rewards })
  } catch (error) {
    console.error('API user-rewards error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

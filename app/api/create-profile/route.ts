import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { user_wallet, username } = await req.json()
    if (!user_wallet || !username || typeof user_wallet !== 'string' || typeof username !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceRole)

    // Generate an 8-char uppercase referral code
    const generateReferralCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let out = ''
      for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
      return out
    }

    const referral_code = generateReferralCode()

    const { data, error } = await admin
      .from('user_profiles')
      .upsert({ user_wallet, username, referral_code }, { onConflict: 'user_wallet' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, profile: data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}



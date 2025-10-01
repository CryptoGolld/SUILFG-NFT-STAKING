import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const user_wallet = searchParams.get('user_wallet') || ''
    if (!user_wallet) {
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

    const { data, error } = await admin
      .from('user_profiles')
      .select('*')
      .eq('user_wallet', user_wallet)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user_wallet, username } = await req.json()
    if (!user_wallet || !username || typeof user_wallet !== 'string' || typeof username !== 'string') {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ 
        success: false, 
        error: 'Server not configured', 
        debug: { hasUrl: !!supabaseUrl, hasKey: !!serviceRole }
      }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Generate an 8-char uppercase referral code
    const generateReferralCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      let out = ''
      for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
      return out
    }

    // Check if profile exists; if yes, return it without changing referral_code
    const { data: existing, error: existingErr } = await admin
      .from('user_profiles')
      .select('*')
      .eq('user_wallet', user_wallet)
      .single()

    if (existing && !existingErr) {
      return NextResponse.json({ success: true, profile: existing })
    }

    const referral_code = generateReferralCode()

    const { data, error } = await admin
      .from('user_profiles')
      .insert({ user_wallet, username, referral_code })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ 
        success: false, 
        error: error.message,
        code: error.code,
        details: error.details 
      }, { status: 400 })
    }

    return NextResponse.json({ success: true, profile: data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unknown error' }, { status: 500 })
  }
}



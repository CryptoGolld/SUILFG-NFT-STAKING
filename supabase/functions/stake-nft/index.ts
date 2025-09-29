import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StakeRequest {
  user_wallet: string
  nft_object_id: string
  nft_tier: 'Voter' | 'Governor' | 'Council'
  staking_duration_days: number
  stake_duration_months: number
  referral_code_used?: string
  verification_code?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user from the auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error('Invalid authorization')
    }

    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    const body: StakeRequest = await req.json()

    // Validate required fields
    const { user_wallet, nft_object_id, nft_tier, staking_duration_days, stake_duration_months, referral_code_used, verification_code } = body

    if (!user_wallet || !nft_object_id || !nft_tier || !staking_duration_days || !stake_duration_months) {
      throw new Error('Missing required fields')
    }

    if (!['Voter', 'Governor', 'Council'].includes(nft_tier)) {
      throw new Error('Invalid NFT tier')
    }

    if (staking_duration_days < 30 || staking_duration_days > 1095) { // 30 days to 3 years
      throw new Error('Staking duration must be between 30 and 1095 days')
    }

    if (![1, 2, 3].includes(stake_duration_months)) {
      throw new Error('Stake duration months must be 1, 2, or 3')
    }

    // Calculate expected days from months for validation
    const expectedDays = stake_duration_months * 30
    if (Math.abs(staking_duration_days - expectedDays) > 2) { // Allow 2 days variance
      throw new Error(`Staking duration days (${staking_duration_days}) doesn't match months (${stake_duration_months})`)
    }

    // Verify the user_wallet matches the authenticated user
    if (user_wallet !== user.user_metadata?.wallet_address) {
      throw new Error('Wallet address does not match authenticated user')
    }

    // Check if NFT is already staked
    const { data: existingStake } = await supabaseClient
      .from('staked_nfts')
      .select('id')
      .eq('nft_object_id', nft_object_id)
      .single()

    if (existingStake) {
      throw new Error('NFT is already staked')
    }

    // Re-use check: Check if this NFT has been used in a confirmed referral before for the same referrer
    let referralId = null
    if (referral_code_used) {
      // Check if this specific NFT + referrer combination has been used before
      // Look for any staked_nft record with this NFT and referrer combination
      const { data: existingNftReferral } = await supabaseClient
        .from('staked_nfts')
        .select('id, referral_id')
        .eq('nft_object_id', nft_object_id)
        .eq('referral_code_used', referral_code_used)
        .single()

      if (existingNftReferral) {
        throw new Error('This NFT has already been used for a referral with this referrer')
      }
    }

    // Calculate stake end time
    const stakeStartTime = new Date()
    const stakeEndTime = new Date(stakeStartTime.getTime() + staking_duration_days * 24 * 60 * 60 * 1000)

    // If referral code was used, create referral record first
    if (referral_code_used) {
      const { data: referralData, error: referralError } = await supabaseClient
        .from('referrals')
        .insert({
          referrer_wallet: referral_code_used,
          status: 'pending'
        })
        .select()
        .single()

      if (referralError) {
        throw new Error(`Failed to create referral record: ${referralError.message}`)
      }

      referralId = referralData.id
    }

    // Insert new stake record
    const { data: stakeData, error: stakeError } = await supabaseClient
      .from('staked_nfts')
      .insert({
        user_wallet,
        nft_object_id,
        nft_tier,
        staking_duration_days,
        stake_duration_months,
        stake_start_time: stakeStartTime.toISOString(),
        stake_end_time: stakeEndTime.toISOString(),
        referral_code_used: referral_code_used || null,
        verification_code: verification_code || null,
        referral_id: referralId,
        status: 'active'
      })
      .select()
      .single()

    if (stakeError) {
      throw new Error(`Failed to create stake: ${stakeError.message}`)
    }

    // Update the referral record with the staked_nft_id
    if (referralId) {
      const { error: updateReferralError } = await supabaseClient
        .from('referrals')
        .update({ staked_nft_id: stakeData.id })
        .eq('id', referralId)

      if (updateReferralError) {
        console.error('Failed to update referral record:', updateReferralError)
        // Don't fail the entire operation for referral errors
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'NFT staked successfully',
        stake: stakeData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

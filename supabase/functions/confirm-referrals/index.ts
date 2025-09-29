import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Only allow this function to be called by authorized services
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.includes('Bearer')) {
      throw new Error('Unauthorized')
    }

    if (req.method !== 'POST') {
      throw new Error('Method not allowed')
    }

    console.log('Starting referral confirmation processing...')

    // 1. Find stakes that have been active for >= 10 days and confirm their referrals
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    const { data: eligibleStakes, error: stakesError } = await supabaseClient
      .from('staked_nfts')
      .select(`
        id,
        stake_start_time,
        status,
        referrals!inner(
          id,
          status,
          referrer_wallet
        )
      `)
      .eq('status', 'active')
      .lte('stake_start_time', tenDaysAgo.toISOString())
      .eq('referrals.status', 'pending')

    if (stakesError) {
      throw new Error(`Failed to fetch eligible stakes: ${stakesError.message}`)
    }

    console.log(`Found ${eligibleStakes?.length || 0} stakes eligible for referral confirmation...`)

    // 2. Confirm the referrals
    for (const stake of eligibleStakes || []) {
      if (stake.referrals && stake.referrals.length > 0) {
        const referral = stake.referrals[0]

        const { error: updateError } = await supabaseClient
          .from('referrals')
          .update({ status: 'confirmed' })
          .eq('id', referral.id)

        if (updateError) {
          console.error(`Failed to confirm referral ${referral.id}:`, updateError)
        } else {
          console.log(`Confirmed referral ${referral.id} for stake ${stake.id}`)
        }
      }
    }

    // 3. Check for users who have achieved 3 confirmed referrals of the same tier
    const { data: referrers, error: referrersError } = await supabaseClient
      .from('referrals')
      .select(`
        referrer_wallet,
        staked_nfts!inner(nft_tier),
        status
      `)
      .eq('status', 'confirmed')

    if (referrersError) {
      throw new Error(`Failed to fetch confirmed referrals: ${referrersError.message}`)
    }

    // Group referrals by referrer and tier
    const referralCounts = new Map<string, Map<string, number>>()

    for (const referral of referrers || []) {
      const referrer = referral.referrer_wallet
      const tier = referral.staked_nfts.nft_tier

      if (!referralCounts.has(referrer)) {
        referralCounts.set(referrer, new Map())
      }

      const tierCounts = referralCounts.get(referrer)!
      tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1)
    }

    // 4. Find users who have reached 3 confirmed referrals of the same tier
    const usersForReward = []

    for (const [referrer, tierCounts] of referralCounts.entries()) {
      for (const [tier, count] of tierCounts.entries()) {
        if (count >= 3) {
          usersForReward.push({
            referrer_wallet: referrer,
            nft_tier: tier,
            referral_count: count
          })
        }
      }
    }

    console.log(`Found ${usersForReward.length} users eligible for NFT rewards...`)

    // 5. Here you would implement the NFT reward logic
    // For now, we'll just log the users who should receive rewards
    // In a real implementation, you might:
    // - Call a smart contract to mint/transfer NFTs
    // - Update a separate rewards table
    // - Send notifications to users

    for (const user of usersForReward) {
      console.log(`User ${user.referrer_wallet} has earned an NFT reward for ${user.nft_tier} tier (${user.referral_count} confirmed referrals)`)

      // TODO: Implement actual NFT minting/transfer logic here
      // This could involve:
      // 1. Calling a Sui smart contract
      // 2. Updating an external system
      // 3. Creating a record for manual processing
    }

    // 6. Optional: Reset referral counts after rewarding (or implement cooldown)
    // For now, we'll leave the counts as-is so users can earn multiple rewards

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Referral confirmation processing completed',
        confirmedReferrals: eligibleStakes?.length || 0,
        usersEligibleForReward: usersForReward.length,
        rewardUsers: usersForReward
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Referral confirmation processor error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

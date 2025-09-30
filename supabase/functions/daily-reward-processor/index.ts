import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sui RPC configuration
const SUI_RPC_URL = 'https://fullnode.mainnet.sui.io:443'

// Known marketplace addresses (add your marketplace contract addresses here)
const MARKETPLACE_ADDRESSES = [
  // Add known Sui NFT marketplace contract addresses
  // Example: '0x123...', '0x456...'
]

// Points configuration per tier per hour
const POINTS_PER_HOUR = {
  'Council': 300,   // Gold tier - 300 points per hour (7,200/day)
  'Governor': 60,   // Silver tier - 60 points per hour (1,440/day)
  'Voter': 12       // Bronze tier - 12 points per hour (288/day)
}

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

    console.log('Starting daily reward processing...')

    // 1. Process Active Stakes
    const { data: activeStakes, error: stakesError } = await supabaseClient
      .from('staked_nfts')
      .select('*')
      .eq('status', 'active')

    if (stakesError) {
      throw new Error(`Failed to fetch active stakes: ${stakesError.message}`)
    }

    console.log(`Processing ${activeStakes?.length || 0} active stakes...`)

    // 2. Process referrals that have been active for >= 10 days and confirm them
    console.log('Confirming referrals that have been active for >= 10 days...')

    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

    const { data: eligibleReferrals, error: referralsError } = await supabaseClient
      .from('referrals')
      .select(`
        id,
        referrer_wallet,
        staked_nft_id,
        status,
        staked_nfts!inner(nft_tier)
      `)
      .eq('status', 'pending')
      .gte('staked_nfts.stake_start_time', tenDaysAgo.toISOString())

    if (referralsError) {
      console.error('Failed to fetch eligible referrals:', referralsError)
    } else {
      for (const referral of eligibleReferrals || []) {
        const { error: confirmError } = await supabaseClient
          .from('referrals')
          .update({ status: 'confirmed' })
          .eq('id', referral.id)

        if (confirmError) {
          console.error(`Failed to confirm referral ${referral.id}:`, confirmError)
        } else {
          console.log(`Confirmed referral ${referral.id} for ${referral.referrer_wallet}`)
        }
      }
    }

    // 3. Process active stakes with the updated logic
    for (const stake of activeStakes || []) {
      // Ensure stake_end_time is properly set (handle any missing calculations)
      if (!stake.stake_end_time) {
        console.log(`Warning: stake ${stake.id} missing stake_end_time, skipping`)
        continue
      }
      try {
        // Verify NFT ownership using Sui RPC
        const ownershipResult = await verifyNFTOwnership(stake.nft_object_id, stake.user_wallet)

        if (ownershipResult.isOwned) {
          // Calculate points for this stake based on tier (per 10 minutes)
          // Apply duration multiplier: 1 month = 1x, 2 months = 1.5x, 3 months = 2x
          const hourlyRate = POINTS_PER_HOUR[stake.nft_tier as keyof typeof POINTS_PER_HOUR] || 0
          const basePoints = hourlyRate / 6 // Base 10-minute portion

          // Apply duration multiplier
          let durationMultiplier = 1
          if (stake.stake_duration_months === 2) durationMultiplier = 1.5
          else if (stake.stake_duration_months === 3) durationMultiplier = 2

          const pointsToAdd = basePoints * durationMultiplier

          // Upsert points into the appropriate tier column
          const columnName = `${stake.nft_tier.toLowerCase()}_points`

          const { error: rewardError } = await supabaseClient
            .from('staking_rewards')
            .upsert({
              user_wallet: stake.user_wallet,
              [columnName]: supabaseClient.sql`COALESCE(${columnName}, 0) + ${pointsToAdd}`,
              last_updated: new Date().toISOString()
            }, {
              onConflict: 'user_wallet'
            })

          if (rewardError) {
            console.error(`Failed to update rewards for ${stake.user_wallet}:`, rewardError)
          } else {
            console.log(`Added ${pointsToAdd} ${stake.nft_tier} points (${stake.stake_duration_months}mo × ${durationMultiplier}x) to ${stake.user_wallet}`)
          }
        } else {
          // Ownership verification failed - forfeit the stake and track the forfeiture
          const forfeitureReason = ownershipResult.isListed ? 'listed' : 'transferred'

          const { error: forfeitError } = await supabaseClient
            .from('staked_nfts')
            .update({
              status: 'forfeited',
              forfeited_by_referrer: stake.referral_code_used
            })
            .eq('id', stake.id)

          if (forfeitError) {
            console.error(`Failed to forfeit stake ${stake.id}:`, forfeitError)
          } else {
            // Update referral status to forfeited
            if (stake.referral_id) {
              await supabaseClient
                .from('referrals')
                .update({ status: 'forfeited' })
                .eq('id', stake.referral_id)
            }

            // Create a forfeiture record
            const { error: forfeitureRecordError } = await supabaseClient
              .from('forfeitures')
              .insert({
                staked_nft_id: stake.id,
                original_staker_wallet: stake.user_wallet,
                referrer_wallet: stake.referral_code_used,
                forfeiture_reason: forfeitureReason,
                forfeited_at: new Date().toISOString()
              })

            if (forfeitureRecordError) {
              console.error(`Failed to create forfeiture record for stake ${stake.id}:`, forfeitureRecordError)
            } else {
              console.log(`Forfeited stake ${stake.id} due to ${forfeitureReason} (${ownershipResult.reason}) and created forfeiture record`)
            }
          }
        }
      } catch (error) {
        console.error(`Error processing stake ${stake.id}:`, error)
      }
    }

    // 4. Grouping Logic: Find referrers with 3+ unmapped referrals (pending OR confirmed) and create groups
    console.log('Processing referral grouping logic...')

    // Get all unmapped referrals (both pending and confirmed) that aren't mapped to rewards yet
    const { data: unmappedReferrals, error: unmappedError } = await supabaseClient
      .from('referrals')
      .select(`
        id,
        referrer_wallet,
        status,
        staked_nfts!inner(nft_tier)
      `)
      .in('status', ['pending', 'confirmed'])
      .eq('is_mapped_to_reward', false)

    if (unmappedError) {
      console.error('Failed to fetch unmapped referrals:', unmappedError)
    } else {
      // Group referrals by referrer and tier
      const referrerGroups = new Map<string, Map<string, any[]>>()

      for (const referral of unmappedReferrals || []) {
        const referrer = referral.referrer_wallet
        const tier = referral.staked_nfts.nft_tier

        if (!referrerGroups.has(referrer)) {
          referrerGroups.set(referrer, new Map())
        }

        const tierMap = referrerGroups.get(referrer)!
        if (!tierMap.has(tier)) {
          tierMap.set(tier, [])
        }

        tierMap.get(tier)!.push(referral)
      }

      // Create groups for referrers with 3+ referrals of the same tier
      for (const [referrer, tierMap] of referrerGroups.entries()) {
        for (const [tier, referrals] of tierMap.entries()) {
          if (referrals.length >= 3) {
            // Sort by creation date (oldest first) and take the first 3
            const sortedReferrals = referrals
              .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
              .slice(0, 3)

            // Create a new referral group
            const { data: groupData, error: groupError } = await supabaseClient
              .from('referral_groups')
              .insert({
                referrer_wallet: referrer,
                reward_tier: tier,
                referral_1_id: sortedReferrals[0].id,
                referral_2_id: sortedReferrals[1].id,
                referral_3_id: sortedReferrals[2].id,
                status: 'vesting',
                gamble_status: 'offered'
              })
              .select()
              .single()

            if (groupError) {
              console.error(`Failed to create group for ${referrer} (${tier}):`, groupError)
            } else {
              // Mark the referrals as mapped
              const referralIds = sortedReferrals.map(r => r.id)
              const { error: updateError } = await supabaseClient
                .from('referrals')
                .update({ is_mapped_to_reward: true })
                .in('id', referralIds)

              if (updateError) {
                console.error(`Failed to mark referrals as mapped for group ${groupData.id}:`, updateError)
              } else {
                console.log(`Created group ${groupData.id} for ${referrer} with ${tier} tier referrals`)
              }
            }
          }
        }
      }
    }

    // 5. Group Monitoring: Check existing groups for forfeiture or claimable status
    console.log('Monitoring existing referral groups...')

    const { data: existingGroups, error: groupsError } = await supabaseClient
      .from('referral_groups')
      .select(`
        id,
        status,
        vesting_end_time,
        gamble_status,
        referral_1_id,
        referral_2_id,
        referral_3_id,
        referrals!inner(status)
      `)
      .in('status', ['vesting', 'claimable'])

    if (groupsError) {
      console.error('Failed to fetch existing groups:', groupsError)
    } else {
      for (const group of existingGroups || []) {
        // Check if any of the 3 referrals are forfeited
        const referralStatuses = group.referrals.map((r: any) => r.status)
        const hasForfeited = referralStatuses.includes('forfeited')

        if (hasForfeited) {
          // Forfeit the entire group and unmap the valid referrals
          const { error: forfeitGroupError } = await supabaseClient
            .from('referral_groups')
            .update({ status: 'forfeited' })
            .eq('id', group.id)

          if (forfeitGroupError) {
            console.error(`Failed to forfeit group ${group.id}:`, forfeitGroupError)
          } else {
            // Unmap the referrals that are still valid
            const validReferrals = group.referrals.filter((r: any) => r.status !== 'forfeited')
            if (validReferrals.length > 0) {
              const validIds = validReferrals.map((r: any) => r.id)
              await supabaseClient
                .from('referrals')
                .update({ is_mapped_to_reward: false })
                .in('id', validIds)
            }

            console.log(`Forfeited group ${group.id} due to forfeited referrals`)
          }
        } else {
          // Check if all referrals in the group are confirmed AND vesting period is complete
          const referralStatuses = group.referrals.map((r: any) => r.status)
          const allConfirmed = referralStatuses.every((status: string) => status === 'confirmed')

          if (allConfirmed) {
            const now = new Date()
            const vestingEnd = new Date(group.vesting_end_time)

            if (now >= vestingEnd) {
              // All referrals confirmed and vesting period complete - make claimable
              if (group.gamble_status !== 'lost') {
                const { error: claimableError } = await supabaseClient
                  .from('referral_groups')
                  .update({ status: 'claimable' })
                  .eq('id', group.id)

                if (claimableError) {
                  console.error(`Failed to make group ${group.id} claimable:`, claimableError)
                } else {
                  console.log(`Made group ${group.id} claimable (all referrals confirmed)`)
                }
              }
            }
          } else {
            // Still have pending referrals - check if any became forfeited
            const hasForfeited = referralStatuses.includes('forfeited')

            if (hasForfeited) {
              // Forfeit the entire group and unmap the valid referrals
              const { error: forfeitGroupError } = await supabaseClient
                .from('referral_groups')
                .update({ status: 'forfeited' })
                .eq('id', group.id)

              if (forfeitGroupError) {
                console.error(`Failed to forfeit group ${group.id}:`, forfeitGroupError)
              } else {
                // Unmap the referrals that are still valid
                const validReferrals = group.referrals.filter((r: any) => r.status !== 'forfeited')
                if (validReferrals.length > 0) {
                  const validIds = validReferrals.map((r: any) => r.id)
                  await supabaseClient
                    .from('referrals')
                    .update({ is_mapped_to_reward: false })
                    .in('id', validIds)
                }

                console.log(`Forfeited group ${group.id} due to forfeited referrals`)
              }
            }
            // If no forfeitures and not all confirmed yet, group continues vesting
          }
        }
      }
    }

    // 6. Process Manual Reward Grants
    const { data: activeGrants, error: grantsError } = await supabaseClient
      .from('manual_reward_grants')
      .select('*')
      .eq('status', 'active')
      .or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString())

    if (grantsError) {
      throw new Error(`Failed to fetch active grants: ${grantsError.message}`)
    }

    console.log(`Processing ${activeGrants?.length || 0} active manual grants...`)

    for (const grant of activeGrants || []) {
      try {
        // Calculate points for this grant based on tier (per 10 minutes)
        const hourlyRate = POINTS_PER_HOUR[grant.reward_tier as keyof typeof POINTS_PER_HOUR] || 0
        const pointsToAdd = hourlyRate / 6 // Exact division (no rounding needed)

        // Upsert points into the appropriate tier column
        const columnName = `${grant.reward_tier.toLowerCase()}_points`

        const { error: rewardError } = await supabaseClient
          .from('staking_rewards')
          .upsert({
            user_wallet: grant.user_wallet,
            [columnName]: supabaseClient.sql`COALESCE(${columnName}, 0) + ${pointsToAdd}`,
            last_updated: new Date().toISOString()
          }, {
            onConflict: 'user_wallet'
          })

        if (rewardError) {
          console.error(`Failed to process manual grant for ${grant.user_wallet}:`, rewardError)
        } else {
          console.log(`Added ${pointsToAdd} ${grant.reward_tier} points (10-min portion of ${hourlyRate}/hour) via manual grant to ${grant.user_wallet}`)
        }
      } catch (error) {
        console.error(`Error processing manual grant ${grant.id}:`, error)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily reward processing completed',
        processedStakes: activeStakes?.length || 0,
        processedGrants: activeGrants?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Daily reward processor error:', error)
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

// Helper function to verify NFT ownership and check for marketplace listings
async function verifyNFTOwnership(nftObjectId: string, expectedOwner: string): Promise<{ isOwned: boolean, isListed: boolean, reason?: string }> {
  try {
    const response = await fetch(SUI_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [nftObjectId, { showOwner: true }]
      })
    })

    if (!response.ok) {
      throw new Error(`Sui RPC request failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`Sui RPC error: ${data.error.message}`)
    }

    const owner = data.result?.data?.owner
    if (!owner) {
      return { isOwned: false, isListed: false, reason: 'No owner found' }
    }

    // Handle different owner types
    if (owner.AddressOwner) {
      const currentOwner = owner.AddressOwner

      // Check if still owned by expected owner
      if (currentOwner === expectedOwner) {
        return { isOwned: true, isListed: false }
      }

      // Check if transferred to a marketplace
      if (MARKETPLACE_ADDRESSES.includes(currentOwner)) {
        return { isOwned: false, isListed: true, reason: 'Listed on marketplace' }
      }

      // Transferred to another address (could be sale or transfer)
      return { isOwned: false, isListed: false, reason: 'Transferred to another wallet' }
    }

    if (owner.ObjectOwner) {
      // For object owners, this could be a kiosk or another contract
      // Check if it's a known marketplace kiosk
      const objectOwner = owner.ObjectOwner

      // You could add logic here to check if the object owner is a marketplace kiosk
      // For now, assume any ObjectOwner means it's not directly owned by the user
      return { isOwned: false, isListed: true, reason: 'In kiosk or marketplace' }
    }

    return { isOwned: false, isListed: false, reason: 'Unknown owner type' }
  } catch (error) {
    console.error('Error verifying NFT ownership:', error)
    // In case of RPC errors, we'll be conservative and return false
    return { isOwned: false, isListed: false, reason: 'RPC error' }
  }
}

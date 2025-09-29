import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GambleRequest {
  group_id: string
  user_wallet: string
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

    const body: GambleRequest = await req.json()
    const { group_id, user_wallet } = body

    if (!group_id || !user_wallet) {
      throw new Error('Missing required fields')
    }

    // Verify the user_wallet matches the authenticated user
    if (user_wallet !== user.user_metadata?.wallet_address) {
      throw new Error('Wallet address does not match authenticated user')
    }

    // Get the referral group
    const { data: group, error: groupError } = await supabaseClient
      .from('referral_groups')
      .select('*')
      .eq('id', group_id)
      .eq('referrer_wallet', user_wallet)
      .single()

    if (groupError || !group) {
      throw new Error('Referral group not found or access denied')
    }

    if (group.gamble_status !== 'offered') {
      throw new Error('Gamble already played or not available')
    }

    if (group.status !== 'vesting') {
      throw new Error('Group is not in vesting status')
    }

    // Run the 10% dice roll
    const randomNumber = Math.random() // 0 to 1
    const isWin = randomNumber <= 0.1 // 10% chance

    if (isWin) {
      // Update group to won status and make it claimable
      const { error: updateError } = await supabaseClient
        .from('referral_groups')
        .update({
          gamble_status: 'won',
          status: 'claimable'
        })
        .eq('id', group_id)

      if (updateError) {
        throw new Error(`Failed to update group for win: ${updateError.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          result: 'won',
          message: '🎉 Congratulations! You won the gamble! Your reward is now claimable.',
          group: {
            id: group.id,
            status: 'claimable',
            gamble_status: 'won'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    } else {
      // Loss: Extend vesting time by another 10 days
      const currentEndTime = new Date(group.vesting_end_time)
      const newEndTime = new Date(currentEndTime.getTime() + (10 * 24 * 60 * 60 * 1000)) // Add 10 days

      const { error: updateError } = await supabaseClient
        .from('referral_groups')
        .update({
          gamble_status: 'lost',
          vesting_end_time: newEndTime.toISOString()
        })
        .eq('id', group_id)

      if (updateError) {
        throw new Error(`Failed to update group for loss: ${updateError.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          result: 'lost',
          message: '😔 You lost the gamble. Vesting time extended by 10 days.',
          group: {
            id: group.id,
            status: 'vesting',
            gamble_status: 'lost',
            new_vesting_end_time: newEndTime.toISOString()
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

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

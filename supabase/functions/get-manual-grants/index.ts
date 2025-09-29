import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ManualGrant {
  id: string
  reward_tier: 'Voter' | 'Governor' | 'Council'
  grant_start_time: string
  grant_end_time?: string
  status: 'active' | 'inactive'
  admin_notes?: string
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

    const body = await req.json()
    const { user_wallet } = body

    if (!user_wallet) {
      throw new Error('Missing user_wallet parameter')
    }

    // Verify the user_wallet matches the authenticated user
    if (user_wallet !== user.user_metadata?.wallet_address) {
      throw new Error('Wallet address does not match authenticated user')
    }

    // Fetch active manual grants for the user
    const { data: grants, error: grantsError } = await supabaseClient
      .from('manual_reward_grants')
      .select('*')
      .eq('user_wallet', user_wallet)
      .eq('status', 'active')
      .or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString())
      .order('created_at', { ascending: false })

    if (grantsError) {
      throw new Error(`Failed to fetch manual grants: ${grantsError.message}`)
    }

    // Format the response
    const formattedGrants: ManualGrant[] = (grants || []).map(grant => ({
      id: grant.id,
      reward_tier: grant.reward_tier,
      grant_start_time: grant.grant_start_time,
      grant_end_time: grant.grant_end_time,
      status: grant.status,
      admin_notes: grant.admin_notes
    }))

    return new Response(
      JSON.stringify({
        success: true,
        grants: formattedGrants
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

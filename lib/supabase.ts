import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database schema
export interface StakedNFT {
  id: string
  created_at: string
  user_wallet: string
  nft_object_id: string
  nft_tier: 'Voter' | 'Governor' | 'Council'
  staking_duration_days: number
  stake_start_time: string
  stake_end_time: string
  status: 'active' | 'completed' | 'forfeited'
  referral_code_used?: string
}

export interface StakingRewards {
  id: string
  user_wallet: string
  council_points: number
  governor_points: number
  voter_points: number
  last_updated: string
}

export interface ManualRewardGrant {
  id: string
  created_at: string
  admin_notes?: string
  user_wallet: string
  reward_tier: 'Voter' | 'Governor' | 'Council'
  grant_start_time: string
  grant_end_time?: string
  status: 'active' | 'inactive'
}

export interface Referral {
  id: string
  referrer_wallet: string
  staked_nft_id: string
  status: 'pending' | 'confirmed'
}

// API functions
export const stakeNFT = async (stakeData: {
  user_wallet: string
  nft_object_id: string
  nft_tier: 'Voter' | 'Governor' | 'Council'
  staking_duration_days: number
  referral_code_used?: string
}) => {
  const response = await fetch('/api/stake-nft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(stakeData)
  })

  return response.json()
}

export const getUserRewards = async (user_wallet: string) => {
  const { data, error } = await supabase
    .from('staking_rewards')
    .select('*')
    .eq('user_wallet', user_wallet)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  return data
}

export const getUserStakedNFTs = async (user_wallet: string) => {
  const { data, error } = await supabase
    .from('staked_nfts')
    .select('*')
    .eq('user_wallet', user_wallet)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export const getUserReferrals = async (user_wallet: string) => {
  const { data, error } = await supabase
    .from('referrals')
    .select(`
      *,
      staked_nfts!inner(nft_tier)
    `)
    .eq('referrer_wallet', user_wallet)

  if (error) {
    throw error
  }

  return data
}

export const getManualGrants = async (user_wallet: string) => {
  const { data, error } = await supabase
    .from('manual_reward_grants')
    .select('*')
    .eq('user_wallet', user_wallet)
    .eq('status', 'active')
    .or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString())

  if (error) {
    throw error
  }

  return data
}

export const getUserReferralGroups = async (user_wallet: string) => {
  const { data, error } = await supabase
    .from('referral_groups')
    .select(`
      id,
      reward_tier,
      status,
      vesting_start_time,
      vesting_end_time,
      gamble_status,
      referrals!inner(
        id,
        staked_nfts!inner(nft_tier)
      )
    `)
    .eq('referrer_wallet', user_wallet)
    .order('vesting_start_time', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export const playVestingGamble = async (group_id: string, user_wallet: string) => {
  const response = await fetch('/api/play-vesting-gamble', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      group_id,
      user_wallet
    })
  })

  return response.json()
}

// Utility function to determine NFT tier from blockchain data
export const determineNFTTier = (nftData: any): 'Voter' | 'Governor' | 'Council' => {
  // Based on SuiLFG NFT contract structure from project registry
  // Tiers are determined by Voting Power: Council (25x), Governor (5x), Voter (1.5x)

  if (!nftData || !nftData.attributes) return 'Voter'

  // Check Voting Power attribute to determine tier
  for (const attr of nftData.attributes) {
    if (attr.trait_type === 'Voting Power') {
      const power = attr.value?.toLowerCase()
      if (power?.includes('25x')) return 'Council'
      if (power?.includes('5x')) return 'Governor'
      if (power?.includes('1.5x')) return 'Voter'
    }
  }

  // Fallback: Check Tier attribute directly
  for (const attr of nftData.attributes) {
    if (attr.trait_type === 'Tier') {
      const tier = attr.value?.toLowerCase()
      if (tier === 'council') return 'Council'
      if (tier === 'governor') return 'Governor'
      if (tier === 'voter') return 'Voter'
    }
  }

  // Final fallback: Check name/description for tier keywords
  const name = nftData.name?.toLowerCase() || ''
  const description = nftData.description?.toLowerCase() || ''

  if (name.includes('council') || description.includes('council')) {
    return 'Council'
  }
  if (name.includes('governor') || description.includes('governor')) {
    return 'Governor'
  }
  if (name.includes('voter') || description.includes('voter')) {
    return 'Voter'
  }

  // Default fallback
  return 'Voter'
}

// Utility function to get voting power multiplier from NFT data
export const getVotingPowerMultiplier = (tier: 'Voter' | 'Governor' | 'Council'): number => {
  switch (tier) {
    case 'Council': return 25
    case 'Governor': return 5
    case 'Voter': return 1.5
    default: return 1
  }
}

// Utility function to parse NFT attributes from SuiLFG contract
export const parseSuiLFGAttributes = (nftData: any) => {
  if (!nftData || !nftData.attributes) return {}

  const attributes: Record<string, any> = {}

  for (const attr of nftData.attributes) {
    attributes[attr.trait_type] = attr.value
  }

  return attributes
}

// Utility function to get collection metadata
export const getCollectionMetadata = () => {
  return {
    name: 'SuiLFG Governance NFTs',
    description: 'A multi-tiered governance NFT collection.',
    projectUrl: 'https://www.suilfg.com',
    twitter: 'https://x.com/SuiLFG_',
    collectionImage: 'https://nft.suilfg.com/images/Council.png',
    supplies: {
      Council: 100,
      Governor: 1000,
      Voter: 10000
    }
  }
}

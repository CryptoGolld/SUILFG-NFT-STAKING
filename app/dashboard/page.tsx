'use client'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { useState, useEffect } from 'react'
import { useCurrentWallet, ConnectButton } from '@mysten/dapp-kit'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Wallet, Trophy, Coins, Star, Crown, Award, Clock, Users, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSupabase, getUserRewards, getUserStakedNFTs, getUserReferrals } from '@/lib/supabase'

interface StakingRewards {
  council_points: number
  governor_points: number
  voter_points: number
}

interface StakedNFT {
  id: string
  nft_object_id: string
  name: string
  tier: 'Voter' | 'Governor' | 'Council'
  stake_start_time: string
  stake_end_time: string
  status: 'active' | 'completed' | 'forfeited'
}

interface ManualGrant {
  id: string
  reward_tier: 'Voter' | 'Governor' | 'Council'
  grant_start_time: string
  admin_notes?: string
}

interface ReferralData {
  totalReferrals: number
  confirmedReferrals: number
  pendingReferrals: number
  nextRewardAt: number
}

interface ForfeitureData {
  id: string
  staked_nft_name: string
  original_staker_wallet: string
  forfeiture_reason: string
  forfeited_at: string
}

export default function DashboardPage() {
  const { isConnected, currentWallet } = useCurrentWallet()
  const [rewards, setRewards] = useState<StakingRewards>({ council_points: 0, governor_points: 0, voter_points: 0 })
  const [stakedNfts, setStakedNfts] = useState<StakedNFT[]>([])
  const [manualGrants, setManualGrants] = useState<ManualGrant[]>([])
  const [referrals, setReferrals] = useState<ReferralData>({ totalReferrals: 0, confirmedReferrals: 0, pendingReferrals: 0, nextRewardAt: 3 })
  const [forfeitures, setForfeitures] = useState<ForfeitureData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isConnected && currentWallet) {
      fetchDashboardData()
    }
  }, [isConnected, currentWallet])

  const fetchDashboardData = async () => {
    if (!currentWallet) return

    setLoading(true)
    try {
      // Fetch rewards
      const rewardsData = await getUserRewards(currentWallet.accounts[0].address)
      if (rewardsData) {
        setRewards({
          council_points: rewardsData.council_points || 0,
          governor_points: rewardsData.governor_points || 0,
          voter_points: rewardsData.voter_points || 0
        })
      }

      // Fetch staked NFTs
      const stakedData = await getUserStakedNFTs(currentWallet.accounts[0].address)
      if (stakedData) {
        const formattedStakedNfts: StakedNFT[] = stakedData.map((nft: any) => ({
          id: nft.id,
          nft_object_id: nft.nft_object_id,
          name: `SuiLFG ${nft.nft_tier} #${nft.nft_object_id.slice(-4)}`,
          tier: nft.nft_tier,
          stake_start_time: nft.stake_start_time,
          stake_end_time: nft.stake_end_time,
          status: nft.status
        }))
        setStakedNfts(formattedStakedNfts)
      }

      // Fetch manual grants
      const { data: grantsData } = await getSupabase()
        .from('manual_reward_grants')
        .select('*')
        .eq('user_wallet', currentWallet.accounts[0].address)
        .eq('status', 'active')
        .or('grant_end_time.is.null,grant_end_time.gte.' + new Date().toISOString())

      if (grantsData) {
        const formattedGrants: ManualGrant[] = grantsData.map((grant: any) => ({
          id: grant.id,
          reward_tier: grant.reward_tier,
          grant_start_time: grant.grant_start_time,
          admin_notes: grant.admin_notes
        }))
        setManualGrants(formattedGrants)
      }

      // Fetch referrals
      const referralsData = await getUserReferrals(currentWallet.accounts[0].address)
      if (referralsData) {
        const totalReferrals = referralsData.length
        const confirmedReferrals = referralsData.filter((r: any) => r.status === 'confirmed').length
        const pendingReferrals = totalReferrals - confirmedReferrals

        setReferrals({
          totalReferrals,
          confirmedReferrals,
          pendingReferrals,
          nextRewardAt: 3 // This could be dynamic based on your reward logic
        })
      }

      // Fetch forfeitures (stakes that were forfeited by users who used this user's referral code)
      const { data: forfeituresData } = await getSupabase()
        .from('forfeitures')
        .select(`
          id,
          staked_nft_id,
          original_staker_wallet,
          forfeiture_reason,
          forfeited_at,
          staked_nfts!inner(nft_tier)
        `)
        .eq('referrer_wallet', currentWallet.accounts[0].address)
        .order('forfeited_at', { ascending: false })

      if (forfeituresData) {
        const formattedForfeitures: ForfeitureData[] = forfeituresData.map((forfeiture: any) => ({
          id: forfeiture.id,
          staked_nft_name: `SuiLFG ${forfeiture.staked_nfts?.[0]?.nft_tier || 'Unknown'}`,
          original_staker_wallet: forfeiture.original_staker_wallet,
          forfeiture_reason: forfeiture.forfeiture_reason,
          forfeited_at: forfeiture.forfeited_at
        }))
        setForfeitures(formattedForfeitures)
      }

    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num)
  }

  const getTimeRemaining = (endTime: string) => {
    const now = new Date()
    const endDate = new Date(endTime)
    const diff = endDate.getTime() - now.getTime()
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
    return days > 0 ? `${days} days` : 'Expired'
  }

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'Council': return <Crown className="w-8 h-8" />
      case 'Governor': return <Star className="w-8 h-8" />
      case 'Voter': return <Award className="w-8 h-8" />
      default: return <Trophy className="w-8 h-8" />
    }
  }

  const getTierClasses = (tier: string) => {
    switch (tier) {
      case 'Council':
        return 'tier-card-gold'
      case 'Governor':
        return 'tier-card-silver'
      case 'Voter':
        return 'tier-card-bronze'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-brand-soft">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-brand-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-3 text-brand-700 hover:text-brand-900 transition-colors">
                <ArrowLeft className="w-5 h-5" />
                <div className="relative w-8 h-8">
                  <Image
                    src="/logo.png"
                    alt="SuiLFG Logo"
                    width={32}
                    height={32}
                    className="rounded"
                  />
                </div>
                <span className="font-semibold">Back to Home</span>
              </Link>
            </div>
            <div className="flex items-center">
              {!isConnected ? (
                <button className="btn-primary flex items-center">
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect Wallet
                </button>
              ) : (
                <span className="text-sm text-gray-600">
                  Connected: {currentWallet?.accounts[0]?.address?.slice(0, 6)}...{currentWallet?.accounts[0]?.address?.slice(-4)}
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConnected ? (
          <div className="text-center py-20">
            <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">Please connect your Sui wallet to view your dashboard.</p>
            <ConnectButton className="btn-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Staking Dashboard</h1>
              <p className="text-gray-600">Track your rewards, staked NFTs, and referral progress.</p>
            </div>

            {/* Tiered Rewards Display - The Main Feature */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {/* Council (Gold) Rewards */}
              <div className="tier-card-gold rounded-xl p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-white bg-opacity-20 rounded-full">
                    <Crown className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2 text-white">Council Points</h2>
                <div className="text-4xl font-bold text-white mb-2">
                  {formatNumber(rewards.council_points)}
                </div>
                <p className="text-white text-opacity-90 text-sm">Gold Tier Rewards</p>
              </div>

              {/* Governor (Silver) Rewards */}
              <div className="tier-card-silver rounded-xl p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-white bg-opacity-20 rounded-full">
                    <Star className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2 text-white">Governor Points</h2>
                <div className="text-4xl font-bold text-white mb-2">
                  {formatNumber(rewards.governor_points)}
                </div>
                <p className="text-white text-opacity-90 text-sm">Silver Tier Rewards</p>
              </div>

              {/* Voter (Bronze) Rewards */}
              <div className="tier-card-bronze rounded-xl p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="p-3 bg-white bg-opacity-20 rounded-full">
                    <Award className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2 text-white">Voter Points</h2>
                <div className="text-4xl font-bold text-white mb-2">
                  {formatNumber(rewards.voter_points)}
                </div>
                <p className="text-white text-opacity-90 text-sm">Bronze Tier Rewards</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Staked NFTs */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Your Staked NFTs
                </h2>

                {stakedNfts.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No NFTs currently staked</p>
                    <Link href="/staking" className="btn-primary">
                      Start Staking
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stakedNfts.map((nft) => (
                      <div key={nft.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                            {getTierIcon(nft.tier)}
                          </div>
                          <div>
                            <h3 className="font-medium">{nft.name}</h3>
                            <p className="text-sm text-gray-600 capitalize">{nft.tier} Tier</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{getTimeRemaining(nft.stake_end_time)}</div>
                          <div className="text-xs text-gray-500">remaining</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Referral Tracker */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Referral Program
                </h2>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{referrals.confirmedReferrals}</div>
                      <div className="text-sm text-green-600">Confirmed</div>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{referrals.pendingReferrals}</div>
                      <div className="text-sm text-yellow-600">Pending</div>
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-lg font-semibold">Progress to Next NFT Reward</div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                      <div
                        className="bg-blue-500 h-3 rounded-full transition-all"
                        style={{ width: `${(referrals.confirmedReferrals / referrals.nextRewardAt) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {referrals.confirmedReferrals} / {referrals.nextRewardAt} confirmed referrals
                    </div>
                  </div>

                  <div className="text-center">
                    <Link href="/staking" className="btn-primary text-sm">
                      Share Referral Code
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Grants Display */}
            {manualGrants.length > 0 && (
              <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Trophy className="w-5 h-5 mr-2" />
                  Special Rewards
                </h2>

                <div className="space-y-3">
                  {manualGrants.map((grant) => (
                    <div key={grant.id} className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${getTierClasses(grant.reward_tier)}`}>
                            {getTierIcon(grant.reward_tier)}
                          </div>
                          <div>
                            <div className="font-medium">
                              Contest Winner Reward: {grant.reward_tier} Points
                            </div>
                            <div className="text-sm text-gray-600">
                              Started {new Date(grant.grant_start_time).toLocaleDateString()}
                            </div>
                            {grant.admin_notes && (
                              <div className="text-xs text-gray-500 mt-1">
                                {grant.admin_notes}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-yellow-700">Daily Rewards Active</div>
                          <div className="text-xs text-yellow-600">Automatic daily grants</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Forfeitures Tracker */}
            {forfeitures.length > 0 && (
              <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center text-red-600">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Forfeited Stakes
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Stakes that were forfeited by users who used your referral code:
                </p>

                <div className="space-y-3">
                  {forfeitures.map((forfeiture) => (
                    <div key={forfeiture.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <div className="font-medium text-red-800">
                              {forfeiture.staked_nft_name} forfeited
                            </div>
                            <div className="text-sm text-red-600">
                              By: {forfeiture.original_staker_wallet.slice(0, 6)}...{forfeiture.original_staker_wallet.slice(-4)}
                            </div>
                            <div className="text-xs text-red-500">
                              Reason: {forfeiture.forfeiture_reason} • {new Date(forfeiture.forfeited_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/staking" className="btn-primary">
                Manage Staking
              </Link>
              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

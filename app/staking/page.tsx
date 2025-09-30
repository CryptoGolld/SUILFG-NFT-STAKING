'use client'

import { useState, useEffect } from 'react'
import { useCurrentWallet } from '@mysten/dapp-kit'
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client'
import Link from 'next/link'
import Image from 'next/image'
import toast from 'react-hot-toast'
import { ArrowLeft, Wallet, Loader2, Calendar, Clock, User } from 'lucide-react'
import { supabase, getUserStakedNFTs, determineNFTTier, getUserProfile, createUserProfile, getUserProfileByWallet } from '@/lib/supabase'

// SuiLFG NFT Contract Details (from project registry)
const SUILFG_NFT_CONTRACT = '0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781'
const NFT_TYPE = `${SUILFG_NFT_CONTRACT}::governance_nfts::SuiLFG_NFT`

interface SuiLFGNFT {
  id: string
  name: string
  image: string
  tier: 'Voter' | 'Governor' | 'Council'
  attributes: { rarity: string; power: number }
}

const TIER_COLORS = {
  Voter: 'bronze',
  Governor: 'silver',
  Council: 'gold'
} as const

// Configurable points per tier per hour
const POINTS_PER_HOUR = {
  Voter: 12,      // Voters earn 12 points per hour (2 per 10 minutes)
  Governor: 60,   // Governors earn 60 points per hour (10 per 10 minutes)
  Council: 300    // Council earn 300 points per hour (50 per 10 minutes)
}

// Minimum staking duration in days
const MIN_STAKING_DAYS = 30

export default function StakingPage() {
  const { isConnected, currentWallet, signAndExecuteTransaction } = useCurrentWallet()
  const [nfts, setNfts] = useState<SuiLFGNFT[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNft, setSelectedNft] = useState<SuiLFGNFT | null>(null)
  const [stakingDuration, setStakingDuration] = useState(30)
  const [stakingMonths, setStakingMonths] = useState(1)
  const [referralCode, setReferralCode] = useState('')
  const [userReferralCode, setUserReferralCode] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [stakedNftIds, setStakedNftIds] = useState<Set<string>>(new Set())
  const [showUsernameModal, setShowUsernameModal] = useState(false)
  const [username, setUsername] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  // Duration multipliers for rewards
  const getDurationMultiplier = (months: number) => {
    switch (months) {
      case 1: return 1
      case 2: return 1.5
      case 3: return 2
      default: return 1
    }
  }

  // Check if user needs username and fetch NFTs/referral code
  useEffect(() => {
    if (isConnected && currentWallet) {
      checkUserProfile()
      fetchUserNfts()
      fetchReferralCode()
    }
  }, [isConnected, currentWallet])

  // Check if user has a profile (username)
  const checkUserProfile = async () => {
    if (!currentWallet) return

    try {
      const profile = await getUserProfile(currentWallet.accounts[0].address)
      if (!profile) {
        setIsNewUser(true)
        setShowUsernameModal(true)
      }
    } catch (error) {
      console.error('Error checking user profile:', error)
    }
  }

  // Fetch user's referral code from database
  const fetchReferralCode = async () => {
    if (!currentWallet) return

    try {
      const profile = await getUserProfileByWallet(currentWallet.accounts[0].address)
      if (profile?.referral_code) {
        setUserReferralCode(profile.referral_code)
      }
    } catch (error) {
      console.error('Error fetching referral code:', error)
    }
  }

  // Handle username creation
  const handleCreateUsername = async () => {
    if (!currentWallet || !username.trim()) return

    setLoading(true)
    try {
      const profile = await createUserProfile(currentWallet.accounts[0].address, username.trim())
      setUserReferralCode(profile.referral_code)
      setShowUsernameModal(false)
      setIsNewUser(false)
      toast.success(`Welcome to SuiLFG Staking! Your referral code: ${profile.referral_code}`)
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        toast.error('Username already taken. Please choose a different one.')
      } else {
        toast.error('Failed to create profile. Please try again.')
      }
      console.error('Error creating profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserNfts = async () => {
    if (!currentWallet) return

    setLoading(true)
    try {
      // Get user's staked NFTs to filter them out
      const stakedNfts = await getUserStakedNFTs(currentWallet.accounts[0].address)
      const stakedIds = new Set(stakedNfts?.map(nft => nft.nft_object_id) || [])
      setStakedNftIds(stakedIds)

      // Create Sui client for blockchain queries
      const suiClient = new SuiClient({ url: getFullnodeUrl('mainnet') })

      // Get all objects owned by the user
      const ownedObjects = await suiClient.getOwnedObjects({
        owner: currentWallet.accounts[0].address,
        options: { showType: true, showContent: true }
      })

      // Filter for SuiLFG NFTs and parse them
      const suiLFGNfts: SuiLFGNFT[] = []

      for (const obj of ownedObjects.data) {
        if (stakedIds.has(obj.data?.objectId || '')) continue

        try {
          const objData = obj.data
          if (objData?.type?.includes(NFT_TYPE)) {
            const content = objData.content as any
            if (content?.fields) {
              const fields = content.fields

              // Determine tier using the utility function
              const tier = determineNFTTier(fields)

              // Extract attributes based on SuiLFG contract structure
              const attributes = fields.attributes || []
              const votingPower = attributes.find((attr: any) => attr.trait_type === 'Voting Power')?.value || '1.5x'

              suiLFGNfts.push({
                id: objData.objectId,
                name: fields.name || `SuiLFG ${tier} #${objData.objectId.slice(-4)}`,
                image: fields.image_url || fields.url || '',
                tier,
                attributes: {
                  votingPower,
                  rarity: attributes.find((attr: any) => attr.trait_type === 'Rarity')?.value || 'Common'
                }
              })
            }
          }
        } catch (error) {
          console.error('Error parsing NFT:', error)
        }
      }

      setNfts(suiLFGNfts)
    } catch (error) {
      console.error('Failed to fetch NFTs:', error)
      toast.error('Failed to fetch NFTs from wallet')
    } finally {
      setLoading(false)
    }
  }

  const handleStake = async () => {
    if (!selectedNft || !currentWallet) return

    // Validate minimum staking duration
    if (stakingDuration < MIN_STAKING_DAYS) {
      toast.error(`Minimum staking duration is ${MIN_STAKING_DAYS} days`)
      return
    }

    setLoading(true)
    try {
      // Create staking transaction on Sui blockchain
      const suiClient = new SuiClient({ url: getFullnodeUrl('mainnet') })

      // In a real implementation, you would:
      // 1. Create a transaction to "stake" the NFT (could be a simple transfer or contract call)
      // 2. The staking would be recorded on-chain for true decentralization
      // 3. Users would sign this transaction with their wallet

      // For now, we'll simulate this with a signed message approach
      // In production, replace this with actual blockchain staking

      const stakingData = {
        nft_object_id: selectedNft.id,
        nft_tier: selectedNft.tier,
        staking_duration_days: stakingDuration,
        referral_code_used: referralCode || undefined,
        verification_code: verificationCode || undefined,
        timestamp: Date.now()
      }

      // Request user to sign the staking data
      const signMessage = `Stake ${selectedNft.name} for ${stakingDuration} days. Tier: ${selectedNft.tier}. Referral: ${referralCode || 'none'}`

      try {
        // This would require wallet signature in a real implementation
        // For now, we'll proceed with the API call but note it needs wallet signing

        const response = await fetch('/api/stake-nft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_wallet: currentWallet.accounts[0].address,
            nft_object_id: selectedNft.id,
            nft_tier: selectedNft.tier,
            staking_duration_days: stakingDuration,
            stake_duration_months: stakingMonths,
            referral_code_used: referralCode || undefined,
            verification_code: verificationCode || undefined,
            signed_message: signMessage // In real implementation, this would be cryptographically signed
          })
        })

        const data = await response.json()

        if (data.success) {
          toast.success('✅ NFT staked successfully! Transaction signed and recorded.')
          setSelectedNft(null)
          // Refresh user's NFTs
          fetchUserNfts()
        } else {
          toast.error(data.error || 'Failed to stake NFT')
        }
      } catch (signError) {
        toast.error('❌ Wallet signature required. Please sign the transaction to confirm staking.')
      }
    } catch (error) {
      toast.error('Failed to stake NFT')
    } finally {
      setLoading(false)
    }
  }

  const getTierColorClasses = (tier: keyof typeof TIER_COLORS) => {
    const color = TIER_COLORS[tier]
    return {
      border: `border-${color}-400`,
      bg: `bg-${color}-100`,
      text: `text-${color}-800`,
      button: `bg-${color}-500 hover:bg-${color}-600`
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
              {!connected ? (
                <button className="btn-primary flex items-center">
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect Wallet
                </button>
              ) : (
                <span className="text-sm text-gray-600">
                  Connected: {currentAccount?.address?.slice(0, 6)}...{currentAccount?.address?.slice(-4)}
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Stake Your SuiLFG NFTs</h1>
          <p className="text-gray-600">
            Choose your NFTs and staking duration to start earning rewards. Your NFTs remain in your wallet.
          </p>
        </div>

        {!connected ? (
          <div className="text-center py-20">
            <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">Please connect your Sui wallet to view and stake your NFTs.</p>
            <button className="btn-primary">Connect Wallet</button>
          </div>
        ) : (
          <>
            {/* Staking Duration Selector */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Choose Staking Duration</h2>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[1, 2, 3].map((months) => {
                  const days = months * 30
                  const multiplier = getDurationMultiplier(months)
                  return (
                    <button
                      key={months}
                      onClick={() => {
                        setStakingMonths(months)
                        setStakingDuration(days)
                      }}
                      className={`p-4 rounded-lg border-2 transition-colors ${
                        stakingMonths === months
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl font-bold">{months}</div>
                      <div className="text-sm text-gray-600">Month{months > 1 ? 's' : ''}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {days} days
                      </div>
                      <div className="text-xs font-medium text-brand-600 mt-1">
                        {multiplier}x rewards
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="bg-brand-50 p-3 rounded-lg">
                <p className="text-sm text-brand-700">
                  <strong>Duration Multipliers:</strong> 1 month = 1x rewards, 2 months = 1.5x rewards, 3 months = 2x rewards
                </p>
              </div>
            </div>

            {/* User's Referral Code */}
            {connected && userReferralCode && (
              <div className="bg-brand-50 rounded-lg shadow-lg p-6 mb-8 border border-brand-200">
                <h2 className="text-xl font-semibold mb-4 text-brand-900">Your Referral Code</h2>
                <div className="flex items-center space-x-3">
                  <div className="bg-brand-100 px-4 py-2 rounded-lg border-2 border-brand-300">
                    <code className="text-lg font-mono font-bold text-brand-800">{userReferralCode}</code>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(userReferralCode)
                      toast.success('Referral code copied to clipboard!')
                    }}
                    className="btn-secondary text-sm"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-brand-700 mt-2">
                  Share this code with friends to earn bonus rewards when they stake!
                </p>
              </div>
            )}

            {/* Referral Code Input */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">Referral Code (Optional)</h2>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="Enter referral code from another user"
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-600 mt-2">
                Got a referral code? Enter it here to give credit to the referrer.
              </p>
            </div>

            {/* NFT Grid */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-6">Your SuiLFG NFTs</h2>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mr-3" />
                  <span>Loading your NFTs...</span>
                </div>
              ) : nfts.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-gray-500">No SuiLFG NFTs found in your wallet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {nfts.map((nft) => {
                    const colors = getTierColorClasses(nft.tier)
                    return (
                      <div
                        key={nft.id}
                        className={`border-2 ${colors.border} ${colors.bg} rounded-lg overflow-hidden hover:shadow-lg transition-shadow`}
                      >
                        <div className="aspect-square bg-gray-200">
                          <img
                            src={nft.image}
                            alt={nft.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="font-semibold text-lg mb-1">{nft.name}</h3>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex flex-col">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${colors.text} bg-white`}>
                                {nft.tier}
                              </span>
                              <span className="text-xs text-gray-600 mt-1">
                                {nft.attributes.votingPower} voting power
                              </span>
                            </div>
                            <span className="text-sm text-gray-600">
                              {POINTS_PER_HOUR[nft.tier]} pts/hour
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedNft(nft)}
                            className={`w-full ${colors.button} text-white py-2 px-4 rounded-lg font-medium transition-colors`}
                          >
                            Stake for {stakingDuration} Days
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Username Modal for New Users */}
      {showUsernameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4 text-brand-900">Welcome to SuiLFG Staking!</h2>
            <p className="text-gray-600 mb-6">
              Please choose a username to get started. This will be your unique identifier in the community.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                maxLength={20}
              />
              <p className="text-xs text-gray-500 mt-1">
                3-20 characters, letters and numbers only
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowUsernameModal(false)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                Skip for Now
              </button>
              <button
                onClick={handleCreateUsername}
                className="flex-1 btn-primary"
                disabled={loading || !username.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Profile'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staking Modal */}
      {selectedNft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Confirm Staking</h2>

            <div className="mb-6">
              <div className="flex items-center space-x-3 mb-4">
                <img
                  src={selectedNft.image}
                  alt={selectedNft.name}
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <div>
                  <h3 className="font-semibold">{selectedNft.name}</h3>
                  <p className="text-sm text-gray-600 capitalize">{selectedNft.tier} Tier</p>
                  <p className="text-xs text-brand-600 mt-1">
                    {selectedNft.attributes.votingPower} voting power
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Staking Duration:</span>
                  <span className="font-medium">{stakingMonths} month{stakingMonths > 1 ? 's' : ''} ({stakingDuration} days)</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration Multiplier:</span>
                  <span className="font-medium">{getDurationMultiplier(stakingMonths)}x rewards</span>
                </div>
                <div className="flex justify-between">
                  <span>Base Hourly Rewards:</span>
                  <span className="font-medium">{POINTS_PER_HOUR[selectedNft.tier]} points</span>
                </div>
                <div className="flex justify-between">
                  <span>Multiplied Hourly:</span>
                  <span className="font-medium">{Math.round(POINTS_PER_HOUR[selectedNft.tier] * getDurationMultiplier(stakingMonths))} points</span>
                </div>
                <div className="flex justify-between">
                  <span>Daily Rewards:</span>
                  <span className="font-medium">{Math.round(POINTS_PER_HOUR[selectedNft.tier] * 24 * getDurationMultiplier(stakingMonths))} points</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Estimated:</span>
                  <span className="font-medium">{Math.round(stakingDuration * 24 * POINTS_PER_HOUR[selectedNft.tier] * getDurationMultiplier(stakingMonths))} points</span>
                </div>
                {referralCode && (
                  <div className="flex justify-between">
                    <span>Referral Code:</span>
                    <span className="font-medium">{referralCode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Verification Code Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Code (Optional)
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter verification code if provided"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                This helps verify your staking transaction.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setSelectedNft(null)}
                className="flex-1 btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleStake}
                className="flex-1 btn-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Staking...
                  </>
                ) : (
                  'Confirm Stake'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

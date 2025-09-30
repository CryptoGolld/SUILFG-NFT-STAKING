'use client'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import Link from 'next/link'
import Image from 'next/image'
import { useCurrentWallet, ConnectButton } from '@mysten/dapp-kit'
import { Coins, Trophy, Users, ExternalLink, Twitter } from 'lucide-react'
import { getCollectionMetadata } from '@/lib/supabase'

export default function HomePage() {
  const { isConnected } = useCurrentWallet()
  const collectionMetadata = getCollectionMetadata()

  return (
    <div className="min-h-screen bg-gradient-brand-soft">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-brand-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center space-x-3">
                <div className="relative w-10 h-10">
                  <Image
                    src="/logo.png"
                    alt="SuiLFG Logo"
                    width={40}
                    height={40}
                    className="rounded-lg"
                  />
                </div>
                <span className="text-2xl font-bold bg-gradient-brand bg-clip-text text-transparent">
                  SuiLFG
                </span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/staking"
                className="text-brand-700 hover:text-brand-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Staking
              </Link>
              <Link
                href="/dashboard"
                className="text-brand-700 hover:text-brand-900 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
              {!isConnected && (
                <ConnectButton className="btn-primary" />
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Flexible Staking for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-brand">
              SuiLFG NFTs
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Stake your SuiLFG NFTs to earn tier-based rewards without locking your assets.
            Choose your staking duration and start earning Council (Gold), Governor (Silver), and Voter (Bronze) points.
          </p>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white/70 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-brand-100">
              <div className="w-12 h-12 bg-gradient-brand rounded-lg flex items-center justify-center mb-4 mx-auto">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-brand-900">Tier-Based Rewards</h3>
              <p className="text-brand-700">
                Earn different point values based on your NFT tier - Council, Governor, or Voter
              </p>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-brand-100">
              <div className="w-12 h-12 bg-gradient-brand rounded-lg flex items-center justify-center mb-4 mx-auto">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-brand-900">Flexible Staking</h3>
              <p className="text-brand-700">
                Stake for any duration from 30-90 days. Your NFT stays in your wallet.
              </p>
            </div>

            <div className="bg-white/70 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-brand-100">
              <div className="w-12 h-12 bg-gradient-brand rounded-lg flex items-center justify-center mb-4 mx-auto">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-brand-900">Referral Program</h3>
              <p className="text-brand-700">
                Earn bonus rewards and free NFTs through our referral system
              </p>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/staking"
              className="btn-primary text-lg px-8 py-3"
            >
              Start Staking
            </Link>
              <Link
                href="/dashboard"
                className="btn-secondary text-lg px-8 py-3"
              >
              View Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white/50 backdrop-blur-sm border-t border-brand-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Collection Info */}
            <div>
              <h3 className="text-lg font-semibold text-brand-900 mb-4">Collection Details</h3>
              <div className="space-y-2 text-sm text-brand-700">
                <p><strong>Council:</strong> 100 NFTs (25x voting power)</p>
                <p><strong>Governor:</strong> 1,000 NFTs (5x voting power)</p>
                <p><strong>Voter:</strong> 10,000 NFTs (1.5x voting power)</p>
              </div>
            </div>

            {/* Links */}
            <div>
              <h3 className="text-lg font-semibold text-brand-900 mb-4">Links</h3>
              <div className="space-y-3">
                <a
                  href={collectionMetadata.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-brand-700 hover:text-brand-900 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Official Website
                </a>
                <a
                  href={collectionMetadata.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-brand-700 hover:text-brand-900 transition-colors"
                >
                  <Twitter className="w-4 h-4 mr-2" />
                  Twitter
                </a>
              </div>
            </div>

            {/* Contract Info */}
            <div>
              <h3 className="text-lg font-semibold text-brand-900 mb-4">Contract Details</h3>
              <div className="text-sm text-brand-700 space-y-1">
                <p><strong>Network:</strong> Sui Mainnet</p>
                <p><strong>Contract:</strong> <code className="bg-brand-100 px-1 rounded">0xbd67...c6781</code></p>
                <p><strong>Module:</strong> governance_nfts</p>
              </div>
            </div>
          </div>

          <div className="border-t border-brand-200 mt-8 pt-8 text-center text-sm text-brand-600">
            <p>© 2024 SuiLFG. Built for the SuiLFG governance community.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

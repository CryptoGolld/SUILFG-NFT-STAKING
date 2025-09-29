# SuiLFG Flexible Staking Platform

A comprehensive staking platform for SuiLFG NFTs with tier-based rewards (Gold, Silver, Bronze) and flexible staking durations.

## 🚀 Features

- **Flexible Staking**: Stake NFTs for 1-365 days without locking assets
- **Tier-Based Rewards**: Visual distinction with Gold (Council), Silver (Governor), and Bronze (Voter) styling
- **Self-Custody**: NFTs remain in user wallets during staking
- **Referral Program**: Earn bonus rewards and free NFTs through referrals
- **Admin Controls**: Manual reward grants for contests and special events
- **Real-time Verification**: Daily checks of NFT ownership via Sui RPC

## 🏗️ Architecture

### Backend (Supabase)
- **PostgreSQL Database**: 4 main tables for staking, rewards, grants, and referrals
- **Edge Functions**: Serverless functions for staking, reward processing, and referrals
- **Row Level Security**: Secure user data access policies
- **Cron Jobs**: Automated daily reward processing and referral confirmation

### Frontend (Next.js)
- **Modern UI**: Tailwind CSS with custom tier-based styling
- **Sui Integration**: `@mysten/dapp-kit` for wallet connectivity
- **Real-time Data**: React Query for state management
- **Responsive Design**: Mobile-first approach with tiered visual hierarchy

## 📊 Database Schema

### Tables

1. **`staked_nfts`**: Tracks all staked NFTs with metadata
   - Added `verification_code` and `forfeited_by_referrer` fields
2. **`staking_rewards`**: Accumulates points by tier (council_points, governor_points, voter_points)
3. **`manual_reward_grants`**: Admin-managed special rewards
4. **`referrals`**: Referral relationships for bonus rewards
5. **`forfeitures`**: Tracks forfeited stakes and links them to referrers

## 🎨 Visual Design

### Tier Colors
- **Council (Gold)**: `#fbbf24` - `#f59e0b` gradient with gold accents
- **Governor (Silver)**: `#9ca3af` - `#6b7280` gradient with silver styling
- **Voter (Bronze)**: `#fb923c` - `#f97316` gradient with bronze theme

### Key Components
- Tiered reward cards with distinct visual hierarchy
- Real-time countdown timers for staking durations
- Progress bars for referral rewards
- Admin grant notifications with special styling

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account and project
- Sui wallet for testing

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. **Configure Sui Network:**
   - Update `SUILFG_NFT_CONTRACT` in `app/staking/page.tsx` with your actual SuiLFG NFT contract address
   - Update `NFT_TYPE` with the correct NFT type from your contract
   - Customize the `determineNFTTier` function in `lib/supabase.ts` based on your NFT contract structure

4. **Run Supabase migrations:**
```sql
-- Run the contents of supabase-schema.sql in your Supabase SQL Editor
```

5. **Deploy Edge Functions:**
```bash
supabase functions deploy stake-nft
supabase functions deploy daily-reward-processor
supabase functions deploy confirm-referrals
supabase functions deploy get-manual-grants
```

6. **Set up cron jobs:**
```bash
# Daily reward processor (runs every 24 hours)
supabase functions schedule daily-reward-processor --cron "0 0 * * *"

# Referral confirmation (runs every 24 hours)
supabase functions schedule confirm-referrals --cron "0 0 * * *"
```

7. **Start development server:**
```bash
npm run dev
```

## 🔧 Configuration

### Sui Network Setup

The platform is configured for your SuiLFG NFT collection using the following contract details:

1. **Contract Configuration** (already set in `app/staking/page.tsx`):
```typescript
const SUILFG_NFT_CONTRACT = '0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781'
const NFT_TYPE = `${SUILFG_NFT_CONTRACT}::governance_nfts::SuiLFG_NFT`
```

2. **Tier Detection Logic** (already implemented in `lib/supabase.ts`):
```typescript
export const determineNFTTier = (nftData: any): 'Voter' | 'Governor' | 'Council' => {
  // Based on Voting Power attributes: 25x = Council, 5x = Governor, 1.5x = Voter
  // Checks both 'Voting Power' and 'Tier' attributes
}
```

3. **NFT Attributes Structure**:
   - **Display fields**: `name`, `image_url`, `description`, `url`
   - **Attributes array**: `Tier` and `Voting Power` (25x | 5x | 1.5x)
   - **Supply**: Council (100), Governor (1000), Voter (10000)

4. **Additional Features Added**:
   - **Footer with collection details** and links to official website/Twitter
   - **Voting power display** on NFT cards and staking modal
   - **Enhanced tier detection** based on voting power attributes
   - **Utility functions** for parsing NFT attributes and getting voting multipliers

### Points Configuration
```typescript
const POINTS_PER_HOUR = {
  'Council': 300,   // Gold tier - 300 points per hour (7,200/day)
  'Governor': 60,   // Silver tier - 60 points per hour (1,440/day)
  'Voter': 12       // Bronze tier - 12 points per hour (288/day)
}
```

### Per 10-Minute Rewards (Every Update Cycle)

**Exact Calculations:**
- **6 intervals per hour** (60 minutes ÷ 10 minutes = 6)
- **Points per interval** = `hourly_rate ÷ 6` (exact division, no rounding)

**Results:**
- **Council**: 300 ÷ 6 = **50 points** per 10 minutes
- **Governor**: 60 ÷ 6 = **10 points** per 10 minutes
- **Voter**: 12 ÷ 6 = **2 points** per 10 minutes

**Verification:**
- 50 × 6 = 300 points/hour (exact match)
- 10 × 6 = 60 points/hour (exact match)
- 2 × 6 = 12 points/hour (exact match)

### Referral System
- **Referral Codes**: Users get unique referral codes when they connect their wallet
- **Staking with Referrals**: Users can enter referral codes when staking NFTs
- **Minimum Staking Period**: 30 days minimum staking duration required
- **Forfeiture Tracking**: If NFTs are transferred/sold before completion, the referrer is notified

### Referral Rewards
- Users get 1 confirmed referral per 10 days of active staking
- 3 confirmed referrals of the same tier = 1 free NFT reward
- Referral counts persist for multiple reward tiers

### Update Frequency
- **Reward Processing**: Every 10 minutes (144 times per day)
- **Forfeiture Checking**: Every 10 minutes (2 minutes after rewards)
- **Real-time Ownership**: Verifies NFT ownership every 10 minutes

### Supabase Edge Functions - Invocation Model
**Important**: Each function processes ALL stakers in a single invocation:
- 1 invocation = processes 1,000+ stakers (not 1,000 invocations)
- Total: 288 invocations per day (144 reward + 144 referral checks)
- 288 × 30 days = 8,640 invocations/month (still well within 2M free tier limit)

### Forfeiture Tracking System
When a user stakes an NFT using someone else's referral code:
- If the NFT is transferred/sold before the staking period completes, it's marked as "forfeited"
- The original staker's stake is cancelled and rewards stop
- The referrer (whose code was used) is notified in their dashboard
- A record is created in the `forfeitures` table linking the forfeiture to the referrer
- This helps maintain accountability in the referral system

## 🔐 Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **Input Validation**: Comprehensive validation in Edge Functions
- **Ownership Verification**: Daily RPC calls to verify NFT ownership
- **Automatic Forfeiture**: Stakes are forfeited if ownership verification fails

## 📱 Pages

### `/` - Home Page
- Platform overview and feature highlights
- Navigation to staking and dashboard

### `/staking` - Staking Interface
- NFT grid with tier-based styling
- Staking duration selector (30, 90, 180 days)
- Referral code input
- Staking confirmation modal

### `/dashboard` - User Dashboard
- **Tiered Rewards Display** (main feature)
  - Three distinct cards for Council, Governor, and Voter points
  - Large numbers with tier-specific colors and icons
- Staked NFTs with countdown timers
- Referral progress tracking
- Manual grant notifications

## 🛠️ Development

### Project Structure
```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── staking/          # Staking page
│   ├── globals.css       # Global styles
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── lib/                  # Utilities
│   └── supabase.ts       # Supabase client
├── supabase/            # Edge Functions
│   └── functions/
│       ├── stake-nft/
│       ├── daily-reward-processor/
│       ├── confirm-referrals/
│       └── get-manual-grants/
├── supabase-schema.sql  # Database schema
└── package.json
```

### Key Technologies
- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS with custom tier colors
- **Blockchain**: Sui.js and @mysten/dapp-kit
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **State Management**: React Query
- **Icons**: Lucide React

## 💰 Supabase Edge Functions - Cost & Limits

### Free Tier Limits:
- **2 million Edge Function invocations per month**
- **100,000 database operations per month**
- **500 MB database storage**
- **2 GB bandwidth per month**

### Current Usage (10-minute updates):
- **Reward Processor**: 144 invocations per day × 30 days = 4,320/month
- **Referral Processor**: 144 invocations per day × 30 days = 4,320/month
- **Stake Function**: Variable based on user activity (1-10 per day = 30-300/month)
- **Total Estimated**: ~8,670-8,940 invocations/month (still within free tier)

### Production Scaling:
- If you exceed 2M invocations, it's $0.0000003 per additional invocation
- Database operations are $0.000125 per 1,000 operations
- Very cost-effective for staking platforms

## 🎯 Future Enhancements

1. **NFT Minting Integration**: Automatic NFT rewards via smart contracts
2. **Advanced Analytics**: Detailed staking history and performance metrics
3. **Mobile App**: React Native companion app
4. **Multi-language Support**: Internationalization
5. **Advanced Referral Features**: Tiered referral bonuses and team building

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Contact the development team

---

**Built with ❤️ for the SuiLFG community**

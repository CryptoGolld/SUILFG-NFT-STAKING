-- SuiLFG Flexible Staking Platform Database Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: referrals
-- Tracks referral relationships for bonus rewards
CREATE TABLE IF NOT EXISTS referrals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,
    staked_nft_id UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'forfeited')),
    is_mapped_to_reward BOOLEAN DEFAULT FALSE
);

-- Table 2: user_profiles
-- Stores user profile information including username and referral code
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_wallet TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: staked_nfts
-- Tracks all staked NFTs with their metadata
CREATE TABLE IF NOT EXISTS staked_nfts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_wallet TEXT NOT NULL,
    nft_object_id TEXT UNIQUE NOT NULL,
    nft_tier TEXT NOT NULL CHECK (nft_tier IN ('Voter', 'Governor', 'Council')),
    staking_duration_days INTEGER NOT NULL,
    stake_start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    stake_end_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'forfeited')),
    referral_code_used TEXT,
    verification_code TEXT,
    forfeited_by_referrer TEXT,
    stake_duration_months INTEGER NOT NULL DEFAULT 1 CHECK (stake_duration_months IN (1, 2, 3)),
    referral_id UUID REFERENCES referrals(id)
);

-- Table 5: staking_rewards
-- Stores accumulated points for each user, separated by tier
CREATE TABLE IF NOT EXISTS staking_rewards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_wallet TEXT UNIQUE NOT NULL,
    council_points NUMERIC DEFAULT 0,
    governor_points NUMERIC DEFAULT 0,
    voter_points NUMERIC DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 6: manual_reward_grants
-- Admin-managed rewards for contests and special cases
CREATE TABLE IF NOT EXISTS manual_reward_grants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    admin_notes TEXT,
    user_wallet TEXT NOT NULL,
    reward_tier TEXT NOT NULL CHECK (reward_tier IN ('Voter', 'Governor', 'Council')),
    grant_start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    grant_end_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

-- Table 7: referrals
-- Tracks referral relationships for bonus rewards
CREATE TABLE IF NOT EXISTS referrals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,
    staked_nft_id UUID, -- Nullable initially, will be set when stake is created
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'forfeited')),
    is_mapped_to_reward BOOLEAN DEFAULT FALSE
);

-- Table 8: referral_groups
-- Groups 3 referrals together for vesting rewards
CREATE TABLE IF NOT EXISTS referral_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,
    reward_tier TEXT NOT NULL CHECK (reward_tier IN ('Voter', 'Governor', 'Council')),
    referral_1_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    referral_2_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    referral_3_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'vesting' CHECK (status IN ('vesting', 'claimable', 'forfeited', 'settled')),
    vesting_start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    vesting_end_time TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 days'),
    gamble_status TEXT DEFAULT 'offered' CHECK (gamble_status IN ('offered', 'won', 'lost', 'ignored'))
);

-- Table 9: forfeitures
-- Tracks when staked NFTs are forfeited (transferred/sold before completion)
CREATE TABLE IF NOT EXISTS forfeitures (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    staked_nft_id UUID NOT NULL REFERENCES staked_nfts(id) ON DELETE CASCADE,
    original_staker_wallet TEXT NOT NULL,
    referrer_wallet TEXT, -- The wallet that provided the referral code
    forfeiture_reason TEXT NOT NULL CHECK (forfeiture_reason IN ('transferred', 'sold', 'listed', 'kiosk')),
    forfeited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_staked_nfts_status ON staked_nfts(status);
CREATE INDEX IF NOT EXISTS idx_staked_nfts_stake_end_time ON staked_nfts(stake_end_time);
CREATE INDEX IF NOT EXISTS idx_staked_nfts_user_wallet ON staked_nfts(user_wallet);
CREATE INDEX IF NOT EXISTS idx_staked_nfts_nft_object_id ON staked_nfts(nft_object_id);
CREATE INDEX IF NOT EXISTS idx_manual_reward_grants_status ON manual_reward_grants(status);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_forfeitures_referrer_wallet ON forfeitures(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_forfeitures_staked_nft_id ON forfeitures(staked_nft_id);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staked_nfts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_reward_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE forfeitures ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_wallet);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can only see their own staked NFTs
CREATE POLICY "Users can view own staked NFTs" ON staked_nfts
    FOR SELECT USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can insert their own staked NFTs
CREATE POLICY "Users can insert own staked NFTs" ON staked_nfts
    FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_wallet);

-- Users can update their own staked NFTs (for status changes)
CREATE POLICY "Users can update own staked NFTs" ON staked_nfts
    FOR UPDATE USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can only see their own rewards
CREATE POLICY "Users can view own rewards" ON staking_rewards
    FOR SELECT USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can only see their own manual grants
CREATE POLICY "Users can view own manual grants" ON manual_reward_grants
    FOR SELECT USING (auth.jwt() ->> 'sub' = user_wallet);

-- Users can view referrals where they are the referrer
CREATE POLICY "Users can view own referrals" ON referrals
    FOR SELECT USING (auth.jwt() ->> 'sub' = referrer_wallet);

-- Users can view forfeitures where they are the referrer (whose code was used)
CREATE POLICY "Users can view forfeitures as referrer" ON forfeitures
    FOR SELECT USING (auth.jwt() ->> 'sub' = referrer_wallet);

-- Add foreign key constraint for referrals.staked_nft_id (after staked_nfts table is created)
ALTER TABLE referrals ADD CONSTRAINT fk_referrals_staked_nft_id
FOREIGN KEY (staked_nft_id) REFERENCES staked_nfts(id) ON DELETE CASCADE;

-- Admin payout queue view (for admin to see what needs to be paid out)
CREATE OR REPLACE VIEW daily_payout_queue AS
SELECT
    rg.id,
    rg.referrer_wallet,
    rg.reward_tier,
    rg.status,
    rg.vesting_end_time,
    rg.gamble_status,
    r1.staked_nft_id as referral_1_nft,
    r2.staked_nft_id as referral_2_nft,
    r3.staked_nft_id as referral_3_nft
FROM referral_groups rg
JOIN referrals r1 ON rg.referral_1_id = r1.id
JOIN referrals r2 ON rg.referral_2_id = r2.id
JOIN referrals r3 ON rg.referral_3_id = r3.id
WHERE rg.status = 'claimable';

-- Function to automatically create staking_rewards entry when a user stakes their first NFT
CREATE OR REPLACE FUNCTION create_user_rewards_entry()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO staking_rewards (user_wallet)
    VALUES (NEW.user_wallet)
    ON CONFLICT (user_wallet) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create rewards entry when first NFT is staked
CREATE TRIGGER trigger_create_user_rewards
    AFTER INSERT ON staked_nfts
    FOR EACH ROW
    EXECUTE FUNCTION create_user_rewards_entry();

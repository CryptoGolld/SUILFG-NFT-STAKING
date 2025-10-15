-- NFT full trace across tables referencing the NFT object IDs
-- Usage: Edit the three object IDs below, then run in Supabase SQL Editor

-- Setup a temp table with target NFT object IDs (edit the VALUES as needed)
DROP TABLE IF EXISTS tmp_target_nfts;
CREATE TEMP TABLE tmp_target_nfts (
  nft_object_id TEXT PRIMARY KEY
);
INSERT INTO tmp_target_nfts (nft_object_id) VALUES
  ('0x383c2f909576dc651906bcff53d5eab8e1b3a58f787b74d39e80bdb6958e8887'),
  ('0x347919e72cdfdd2f26caccfceb62d47bc446e3c0b4c2e19aa8806bd011455c54'),
  ('0xce7224fa7fbe188b8b62696d2dd881311b00a060c96128175fba7f6f9c2d924f');

-- A) All stake rows for the specified NFTs (newest first per NFT)
SELECT 'A_staked_nfts' AS section, s.*
FROM public.staked_nfts s
JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
ORDER BY s.nft_object_id, s.created_at DESC;

-- B) Forfeitures joined to staked rows
SELECT 'B_forfeitures' AS section, f.*, s.nft_object_id, s.nft_tier, s.user_wallet, s.status AS staked_status
FROM public.forfeitures f
JOIN public.staked_nfts s ON s.id = f.staked_nft_id
JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
ORDER BY f.forfeited_at DESC;

-- C) Referrals linked to those stakes
SELECT 'C_referrals' AS section, r.*, s.nft_object_id, s.nft_tier, s.user_wallet
FROM public.referrals r
JOIN public.staked_nfts s ON s.id = r.staked_nft_id
JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
ORDER BY s.created_at DESC;

-- D) Referral groups that include those referrals (+ each referral's status)
WITH related_refs AS (
  SELECT r.id
  FROM public.referrals r
  JOIN public.staked_nfts s ON s.id = r.staked_nft_id
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
)
SELECT 'D_referral_groups' AS section,
       rg.*,
       r1.status AS referral_1_status,
       r2.status AS referral_2_status,
       r3.status AS referral_3_status
FROM public.referral_groups rg
LEFT JOIN public.referrals r1 ON r1.id = rg.referral_1_id
LEFT JOIN public.referrals r2 ON r2.id = rg.referral_2_id
LEFT JOIN public.referrals r3 ON r3.id = rg.referral_3_id
WHERE rg.referral_1_id IN (SELECT id FROM related_refs)
   OR rg.referral_2_id IN (SELECT id FROM related_refs)
   OR rg.referral_3_id IN (SELECT id FROM related_refs)
ORDER BY rg.vesting_start_time DESC;

-- E) Backups (archived prior stakes) for these NFTs
SELECT 'E_restaked_nft_backups' AS section, b.*
FROM public.restaked_nft_backups b
JOIN tmp_target_nfts t ON t.nft_object_id = b.nft_object_id
ORDER BY b.archived_at DESC;

-- F) Staking rewards for wallets associated to these stakes
WITH wallets AS (
  SELECT DISTINCT s.user_wallet
  FROM public.staked_nfts s
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
  UNION
  SELECT DISTINCT f.original_staker_wallet
  FROM public.forfeitures f
  JOIN public.staked_nfts s ON s.id = f.staked_nft_id
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
)
SELECT 'F_staking_rewards' AS section, sr.*
FROM public.staking_rewards sr
JOIN wallets w ON w.user_wallet = sr.user_wallet
ORDER BY sr.user_wallet;

-- G) Manual reward grants for those wallets
WITH wallets AS (
  SELECT DISTINCT s.user_wallet
  FROM public.staked_nfts s
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
  UNION
  SELECT DISTINCT f.original_staker_wallet
  FROM public.forfeitures f
  JOIN public.staked_nfts s ON s.id = f.staked_nft_id
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
)
SELECT 'G_manual_reward_grants' AS section, g.*
FROM public.manual_reward_grants g
JOIN wallets w ON w.user_wallet = g.user_wallet
ORDER BY g.created_at DESC;

-- H) User profiles for both staker and referrer wallets
WITH staker_wallets AS (
  SELECT DISTINCT s.user_wallet
  FROM public.staked_nfts s
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
),
referrer_wallets AS (
  SELECT DISTINCT r.referrer_wallet
  FROM public.referrals r
  JOIN public.staked_nfts s ON s.id = r.staked_nft_id
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
),
all_wallets AS (
  SELECT user_wallet AS wallet FROM staker_wallets
  UNION
  SELECT referrer_wallet AS wallet FROM referrer_wallets
)
SELECT 'H_user_profiles' AS section, up.*
FROM public.user_profiles up
JOIN all_wallets aw ON aw.wallet = up.user_wallet
ORDER BY up.created_at DESC;

-- I) Daily payout queue rows that include these referrals (if view exists)
-- Safe: will return 0 rows if no matching groups or view not present
WITH ref_ids AS (
  SELECT r.id
  FROM public.referrals r
  JOIN public.staked_nfts s ON s.id = r.staked_nft_id
  JOIN tmp_target_nfts t ON t.nft_object_id = s.nft_object_id
),
ref_stake_ids AS (
  SELECT r.staked_nft_id FROM public.referrals r WHERE r.id IN (SELECT id FROM ref_ids)
)
SELECT 'I_daily_payout_queue' AS section, *
FROM public.daily_payout_queue
WHERE referral_1_nft IN (SELECT staked_nft_id FROM ref_stake_ids)
   OR referral_2_nft IN (SELECT staked_nft_id FROM ref_stake_ids)
   OR referral_3_nft IN (SELECT staked_nft_id FROM ref_stake_ids)
ORDER BY vesting_end_time DESC;

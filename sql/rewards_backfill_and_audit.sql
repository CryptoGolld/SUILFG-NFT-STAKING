-- Rewards audit and backfill
-- Run in Supabase SQL Editor (PostgreSQL)

-- 0) High-level counts
SELECT now() AS executed_at;
SELECT COUNT(*) AS staked_nfts_total FROM public.staked_nfts;
SELECT COUNT(DISTINCT user_wallet) AS distinct_wallets_staked FROM public.staked_nfts;
SELECT COUNT(*) AS staking_rewards_rows FROM public.staking_rewards;

-- 1) Compare wallets in staked_nfts vs staking_rewards
WITH staked_wallets AS (
  SELECT DISTINCT user_wallet FROM public.staked_nfts
)
SELECT
  'missing_in_rewards' AS category,
  w.user_wallet
FROM staked_wallets w
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = w.user_wallet
WHERE sr.user_wallet IS NULL
ORDER BY w.user_wallet;

-- 2) Create missing rewards rows (idempotent)
INSERT INTO public.staking_rewards (user_wallet)
SELECT DISTINCT s.user_wallet
FROM public.staked_nfts s
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = s.user_wallet
WHERE sr.user_wallet IS NULL
ON CONFLICT (user_wallet) DO NOTHING;

-- 3) Optional: set a baseline points floor based on elapsed time for ACTIVE stakes only
--    This approximates what the processor would have added since stake_start_time.
--    Safe: it only raises points if current values are lower (uses GREATEST).
WITH active AS (
  SELECT
    user_wallet,
    nft_tier,
    stake_start_time,
    LEAST(COALESCE(stake_end_time, now()), now()) AS effective_end,
    stake_duration_months
  FROM public.staked_nfts
  WHERE status = 'active'
), per_stake AS (
  SELECT
    user_wallet,
    nft_tier,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (effective_end - stake_start_time)) / 600))::bigint AS ten_min_intervals,
    CASE nft_tier WHEN 'Council' THEN 300 WHEN 'Governor' THEN 60 WHEN 'Voter' THEN 12 END / 6.0 AS base_points,
    CASE stake_duration_months WHEN 1 THEN 1.0 WHEN 2 THEN 1.5 WHEN 3 THEN 2.0 ELSE 1.0 END AS duration_mult
  FROM active
), agg AS (
  SELECT
    user_wallet,
    SUM(CASE WHEN nft_tier = 'Council'  THEN ten_min_intervals * base_points * duration_mult ELSE 0 END) AS council_points_calc,
    SUM(CASE WHEN nft_tier = 'Governor' THEN ten_min_intervals * base_points * duration_mult ELSE 0 END) AS governor_points_calc,
    SUM(CASE WHEN nft_tier = 'Voter'    THEN ten_min_intervals * base_points * duration_mult ELSE 0 END) AS voter_points_calc
  FROM per_stake
  GROUP BY user_wallet
)
UPDATE public.staking_rewards sr
SET
  council_points  = GREATEST(COALESCE(sr.council_points,0),  COALESCE(a.council_points_calc,0)),
  governor_points = GREATEST(COALESCE(sr.governor_points,0), COALESCE(a.governor_points_calc,0)),
  voter_points    = GREATEST(COALESCE(sr.voter_points,0),    COALESCE(a.voter_points_calc,0)),
  last_updated    = now()
FROM agg a
WHERE sr.user_wallet = a.user_wallet;

-- 4) Post-checks
SELECT COUNT(*) AS staking_rewards_rows_after FROM public.staking_rewards;
WITH staked_wallets AS (
  SELECT DISTINCT user_wallet FROM public.staked_nfts
)
SELECT
  'still_missing_after_backfill' AS category,
  w.user_wallet
FROM staked_wallets w
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = w.user_wallet
WHERE sr.user_wallet IS NULL
ORDER BY w.user_wallet;

-- 5) Wallet-level view: how many NFTs per wallet and current rewards
SELECT
  s.user_wallet,
  COUNT(*) AS num_staked_nfts,
  SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active_nfts,
  MAX(s.stake_start_time) AS latest_stake_start,
  sr.council_points,
  sr.governor_points,
  sr.voter_points,
  sr.last_updated
FROM public.staked_nfts s
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = s.user_wallet
GROUP BY s.user_wallet, sr.council_points, sr.governor_points, sr.voter_points, sr.last_updated
ORDER BY num_staked_nfts DESC, s.user_wallet;

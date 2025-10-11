-- Run this in Supabase SQL Editor (PostgreSQL)

-- Timestamp
SELECT now() AS executed_at;

-- =========================
-- SCHEMA OVERVIEW
-- =========================

-- Public tables/views with size and row estimates (+ RLS enabled)
SELECT
  n.nspname            AS schema,
  c.relname            AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    WHEN 'f' THEN 'foreign_table'
    WHEN 'p' THEN 'partitioned_table'
    ELSE c.relkind::text
  END                  AS kind,
  pg_total_relation_size(c.oid)      AS total_bytes,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size_pretty,
  s.n_live_tup         AS row_estimate,
  c.relrowsecurity     AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','v','m','f','p')
ORDER BY kind, object_name;

-- Columns (types, defaults, nullability)
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- All constraints (PK, FK, UNIQUE, CHECK) with definitions
SELECT
  conrelid::regclass                  AS table_name,
  conname                             AS constraint_name,
  CASE contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'\n    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    ELSE contype::text
  END                                 AS constraint_type,
  pg_get_constraintdef(pg_constraint.oid, true) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY table_name, constraint_name;

-- Indexes (includes partial index predicates in indexdef)
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Row Level Security: policies and table flags
SELECT
  schemaname,
  tablename,
  polname         AS policy_name,
  cmd             AS command,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
ORDER BY schemaname, tablename, policy_name;

SELECT
  c.relname AS table_name,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Triggers
SELECT
  c.relname AS table_name,
  t.tgname  AS trigger_name,
  t.tgenabled AS enabled,
  pg_get_triggerdef(t.oid, true) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- Views (definitions)
SELECT
  table_name AS view_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Functions (definitions) in public
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY function_name;

-- Grants
SELECT
  table_name,
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;

-- Comments (tables + columns)
SELECT
  'table' AS obj_type,
  c.relname AS obj_name,
  obj_description(c.oid) AS comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','v','m')
  AND obj_description(c.oid) IS NOT NULL
UNION ALL
SELECT
  'column' AS obj_type,
  c.relname || '.' || a.attname AS obj_name,
  col_description(a.attrelid, a.attnum) AS comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND col_description(a.attrelid, a.attnum) IS NOT NULL
ORDER BY obj_type, obj_name;

-- =========================
-- HEALTH CHECKS
-- =========================

-- Counts by status for staked_nfts
SELECT status, COUNT(*) AS count
FROM public.staked_nfts
GROUP BY status
ORDER BY status;

-- Duplicate ACTIVE stakes per nft_object_id
SELECT nft_object_id, COUNT(*) AS active_count, array_agg(id) AS stake_ids
FROM public.staked_nfts
WHERE status = 'active'
GROUP BY nft_object_id
HAVING COUNT(*) > 1
ORDER BY active_count DESC;

-- Any duplicates per nft_object_id (all statuses)
SELECT
  nft_object_id,
  COUNT(*) AS total_rows,
  array_agg(json_build_object('id', id, 'status', status, 'user_wallet', user_wallet, 'created_at', created_at) ORDER BY created_at DESC) AS rows_detail
FROM public.staked_nfts
GROUP BY nft_object_id
HAVING COUNT(*) > 1
ORDER BY total_rows DESC;

-- Orphan referrals (staked_nft_id points to missing stake)
SELECT r.id, r.referrer_wallet, r.staked_nft_id
FROM public.referrals r
LEFT JOIN public.staked_nfts s ON s.id = r.staked_nft_id
WHERE r.staked_nft_id IS NOT NULL AND s.id IS NULL
ORDER BY r.id;

-- Orphan forfeitures (staked_nft_id points to missing stake)
SELECT f.id, f.staked_nft_id
FROM public.forfeitures f
LEFT JOIN public.staked_nfts s ON s.id = f.staked_nft_id
WHERE s.id IS NULL
ORDER BY f.id;

-- Wallets with stakes but missing rewards rows
SELECT DISTINCT s.user_wallet
FROM public.staked_nfts s
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = s.user_wallet
WHERE sr.user_wallet IS NULL
ORDER BY s.user_wallet;

-- Rewards rows with no stakes
SELECT sr.user_wallet
FROM public.staking_rewards sr
LEFT JOIN public.staked_nfts s ON s.user_wallet = sr.user_wallet
WHERE s.user_wallet IS NULL
ORDER BY sr.user_wallet;

-- Active stakes whose stake_end_time is in the past (should likely be 'completed')
SELECT id, nft_object_id, user_wallet, stake_end_time
FROM public.staked_nfts
WHERE status = 'active'
  AND stake_end_time IS NOT NULL
  AND stake_end_time < now()
ORDER BY stake_end_time ASC;

-- Verify the intended partial unique index (only one ACTIVE per NFT)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'staked_nfts'
  AND (indexname = 'ux_staked_nfts_active_nft_object_id'
       OR indexdef ILIKE '%WHERE status = ''active''%');

-- Check if any old UNIQUE constraint still exists on nft_object_id
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid = 'staked_nfts'::regclass
  AND contype = 'u';

-- Confirm the BEFORE INSERT trigger exists on staked_nfts
SELECT t.tgname, pg_get_triggerdef(t.oid, true) AS trigger_def
FROM pg_trigger t
WHERE t.tgrelid = 'staked_nfts'::regclass
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Rewards freshness
SELECT MIN(last_updated) AS earliest_last_updated, MAX(last_updated) AS latest_last_updated
FROM public.staking_rewards;

-- =========================
-- TARGETED DIAGNOSTIC: 3 NFT OBJECT IDS (example; update as needed)
-- =========================
WITH target AS (
  SELECT unnest(ARRAY[
    '0x383c2f909576dc651906bcff53d5eab8e1b3a58f787b74d39e80bdb6958e8887',
    '0x347919e72cdfdd2f26caccfceb62d47bc446e3c0b4c2e19aa8806bd011455c54',
    '0xce7224fa7fbe188b8b62696d2dd881311b00a060c96128175fba7f6f9c2d924f'
  ]) AS nft_object_id
),
stakes AS (
  SELECT s.*
  FROM public.staked_nfts s
  JOIN target t ON t.nft_object_id = s.nft_object_id
),
latest_per_nft AS (
  SELECT *
  FROM (
    SELECT
      s.*,
      ROW_NUMBER() OVER (PARTITION BY s.nft_object_id ORDER BY s.created_at DESC) AS rn
    FROM stakes s
  ) z
  WHERE z.rn = 1
),
wallets AS (
  SELECT DISTINCT user_wallet FROM stakes
)
SELECT 'A_stakes_all' AS section, s.nft_object_id, s.id AS stake_id, s.user_wallet, s.nft_tier, s.status, s.stake_start_time, s.stake_end_time, s.stake_duration_months, s.referral_id, s.created_at
FROM stakes s
ORDER BY s.nft_object_id, s.created_at DESC;

SELECT 'B_latest_per_nft' AS section, l.nft_object_id, l.id AS stake_id, l.user_wallet, l.nft_tier, l.status, l.stake_start_time, l.stake_end_time, l.stake_duration_months, l.referral_id, l.created_at
FROM latest_per_nft l
ORDER BY l.nft_object_id;

SELECT 'C_rewards_for_wallets' AS section, sr.user_wallet, sr.council_points, sr.governor_points, sr.voter_points, sr.last_updated
FROM public.staking_rewards sr
JOIN wallets w ON w.user_wallet = sr.user_wallet
ORDER BY sr.user_wallet;

SELECT 'D_join_stakes_rewards' AS section, s.nft_object_id, s.user_wallet, s.nft_tier, s.status, sr.council_points, sr.governor_points, sr.voter_points, sr.last_updated
FROM latest_per_nft s
LEFT JOIN public.staking_rewards sr ON sr.user_wallet = s.user_wallet
ORDER BY s.nft_object_id;

SELECT 'E_forfeitures_for_these' AS section, f.*
FROM public.forfeitures f
WHERE f.staked_nft_id IN (SELECT id FROM stakes)
ORDER BY f.forfeited_at DESC;

SELECT 'F_referrals_for_these' AS section, r.*
FROM public.referrals r
WHERE r.id IN (SELECT referral_id FROM stakes WHERE referral_id IS NOT NULL)
ORDER BY r.created_at DESC NULLS LAST;

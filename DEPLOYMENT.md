# 🚀 SuiLFG Staking Platform - Production Deployment Guide

## 📋 Prerequisites

1. **GitHub Repository** - Push your code to GitHub
2. **Vercel Account** - For frontend deployment
3. **Supabase Account** - For backend database and Edge Functions
4. **Sui Wallet** - For testing the application

## 🛠️ Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose your organization and enter project details:
   - **Name**: `suilfg-staking` (or your preferred name)
   - **Database Password**: Set a secure password
   - **Region**: Choose closest to your users

### 1.2 Database Setup

1. **Run Database Schema**:
   ```bash
   # Copy the contents of supabase-schema.sql
   # Go to Supabase Dashboard > SQL Editor
   # Paste and execute the entire schema
   ```

2. **Verify Tables Created**:
   - `user_profiles` (includes username and referral_code)
   - `staked_nfts`
   - `staking_rewards`
   - `manual_reward_grants`
   - `referrals`
   - `referral_groups`
   - `forfeitures`

### 1.3 Edge Functions Deployment

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link to Your Project**:
   ```bash
   supabase link --project-ref your-project-id
   ```

4. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy stake-nft
   supabase functions deploy daily-reward-processor
   supabase functions deploy confirm-referrals
   supabase functions deploy get-manual-grants
   ```

5. **Set Up Cron Jobs**:
   ```bash
   # Daily reward processor (runs every 24 hours at midnight UTC)
   supabase functions schedule daily-reward-processor --cron "0 0 * * *"

   # Referral confirmation (runs every 24 hours at 1 AM UTC)
   supabase functions schedule confirm-referrals --cron "0 1 * * *"
   ```

## 🌐 Step 2: Vercel Deployment

### 2.1 Environment Variables Setup

1. **Copy `.env.example` to `.env.local`**:
   ```bash
   cp .env.example .env.local
   ```

2. **Get Supabase Credentials**:
   - Go to Supabase Dashboard > Settings > API
   - Copy your project URL and anon key

3. **Update `.env.local`**:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### 2.2 Deploy to Vercel

1. **Connect GitHub Repo**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

2. **Add Environment Variables**:
   - In Vercel Dashboard > Project Settings > Environment Variables
   - Add all variables from `.env.local`

3. **Deploy**:
   ```bash
   # Vercel will automatically deploy on git push
   git add .
   git commit -m "Deploy to production"
   git push origin main
   ```

## ⚙️ Step 3: Production Configuration

### 3.1 Update Contract Configuration

In `app/staking/page.tsx`, verify your contract details:
```typescript
const SUILFG_NFT_CONTRACT = '0xbd672d1c158c963ade8549ae83bda75f29f6b3ce0c59480f3921407c4e8c6781'
const NFT_TYPE = `${SUILFG_NFT_CONTRACT}::governance_nfts::SuiLFG_NFT`
```

### 3.2 Domain Configuration

1. **Custom Domain** (Optional):
   - Add your domain in Vercel Dashboard
   - Update DNS records as instructed

2. **CORS Configuration**:
   - Ensure your domain is allowed in Supabase CORS settings
   - Go to Supabase Dashboard > Authentication > URL Configuration

### 3.3 Security Headers

Add security headers to `next.config.js`:
```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ]
  },
}
```

## 🔧 Step 4: Testing & Verification

### 4.1 Test Edge Functions

1. **Test Stake Function**:
   ```bash
   curl -X POST 'https://your-project-id.supabase.co/functions/v1/stake-nft' \
   -H 'Authorization: Bearer your-anon-key' \
   -H 'Content-Type: application/json' \
   -d '{"user_wallet":"0x...", "nft_object_id":"0x...", "nft_tier":"Council", "staking_duration_days":30}'
   ```

2. **Check Database**:
   - Verify tables are created in Supabase Dashboard > Table Editor
   - Check Row Level Security policies are active

### 4.2 Frontend Testing

1. **Connect Wallet**: Test Sui wallet connection
2. **NFT Loading**: Verify NFTs load from your contract
3. **Staking Flow**: Test complete staking process
4. **Dashboard**: Check rewards and referral tracking

## 📊 Step 5: Monitoring & Maintenance

### 5.1 Supabase Monitoring

1. **Database Monitoring**:
   - Supabase Dashboard > Database > Monitoring
   - Check query performance and errors

2. **Edge Functions Logs**:
   - Supabase Dashboard > Edge Functions > Logs
   - Monitor function execution and errors

### 5.2 Application Monitoring

1. **Vercel Analytics**:
   - Built-in error tracking and performance monitoring

2. **Custom Logging**:
   - Add error tracking (e.g., Sentry) for production

### 5.3 Database Backups

- Supabase automatically handles daily backups
- Monitor backup status in Dashboard > Database > Backups

## 🔐 Step 6: Security Considerations

### 6.1 API Keys Security

- **Never commit** real keys to GitHub
- Use Vercel environment variables
- Rotate keys periodically

### 6.2 Rate Limiting

Add rate limiting to Edge Functions:
```typescript
// In Edge Functions, add rate limiting logic
const rateLimit = await checkRateLimit(user_wallet)
if (!rateLimit.allowed) {
  return new Response('Rate limit exceeded', { status: 429 })
}
```

### 6.3 Input Validation

- All Edge Functions include input validation
- SQL injection protection via parameterized queries
- XSS protection via proper sanitization

## 🚨 Step 7: Troubleshooting

### Common Issues:

1. **NFTs Not Loading**:
   - Verify contract address is correct
   - Check if NFTs are in user's wallet
   - Ensure RPC endpoint is accessible

2. **Staking Fails**:
   - Check Supabase Edge Function logs
   - Verify database permissions
   - Ensure RLS policies are correct

3. **Rewards Not Updating**:
   - Check cron job execution
   - Verify Edge Function has proper permissions
   - Check database connectivity

### Debug Mode:

Enable debug logging:
```bash
NEXT_PUBLIC_DEBUG=true
```

## 📞 Support & Maintenance

### Regular Tasks:
- Monitor Edge Function execution
- Check database performance
- Update dependencies regularly
- Review and rotate API keys

### Emergency Contacts:
- Vercel Status: [status.vercel.com](https://status.vercel.com)
- Supabase Status: [status.supabase.com](https://status.supabase.com)

---

## ✅ Deployment Checklist

- [ ] Supabase project created
- [ ] Database schema deployed
- [ ] Edge Functions deployed
- [ ] Cron jobs configured
- [ ] Environment variables set in Vercel
- [ ] Custom domain configured (optional)
- [ ] Security headers added
- [ ] Testing completed
- [ ] Monitoring setup

Your SuiLFG staking platform is now ready for production! 🎉

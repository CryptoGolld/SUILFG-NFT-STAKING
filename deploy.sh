#!/bin/bash

# SuiLFG Staking Platform - Quick Deployment Script
echo "🚀 SuiLFG Staking Platform Deployment"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with: npm install -g supabase"
    exit 1
fi

# Check if user is logged in to Supabase
if ! supabase projects list &> /dev/null; then
    echo "❌ Please login to Supabase first: supabase login"
    exit 1
fi

echo "📊 Setting up Supabase database..."
# Run the database schema (you'll need to copy/paste this manually to Supabase SQL Editor)
echo "⚠️  Please copy the contents of supabase-schema.sql to Supabase SQL Editor and execute"

echo "🔧 Deploying Edge Functions..."
supabase functions deploy stake-nft
supabase functions deploy daily-reward-processor
supabase functions deploy confirm-referrals
supabase functions deploy get-manual-grants

echo "⏰ Setting up cron jobs..."
echo "  - Reward processor: Every 10 minutes"
supabase functions schedule daily-reward-processor --cron "*/10 * * * *"
echo "  - Referral confirmation: Every 10 minutes, 2 minutes after rewards"
supabase functions schedule confirm-referrals --cron "2-59/10 * * * *"

echo "🌐 Environment variables needed for Vercel:"
echo "NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co"
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
echo "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"

echo "✅ Deployment setup complete!"
echo ""
echo "Next steps:"
echo "1. Set environment variables in Vercel Dashboard"
echo "2. Push to GitHub and deploy on Vercel"
echo "3. Test the application with your Sui wallet"
echo ""
echo "🔗 Access your deployed app at: https://your-project.vercel.app"

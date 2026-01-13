-- Migration: Fix RLS Policies for Security Improvements
-- Date: 2026-01-13
-- Description: Fixes organization member access and adds admin oversight policies

-- ============================================================================
-- 1. FIX ORGANIZATIONS TABLE - Allow members to see their organization
-- ============================================================================

-- Drop the restrictive policy that only allows owner to see org
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;

-- Create new policy that allows both owners AND members to see the organization
CREATE POLICY "organizations_select_member" ON organizations 
FOR SELECT USING (
  auth.uid()::uuid = owner_id OR
  EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_members.organization_id = organizations.id 
    AND organization_members.user_id = auth.uid()::uuid
    AND organization_members.is_active = true
  )
);

-- ============================================================================
-- 2. ADD ADMIN OVERSIGHT POLICIES FOR LEARNING SESSIONS
-- ============================================================================

-- Admins can view all learning sessions for oversight purposes
CREATE POLICY "learning_sessions_admin_select" ON learning_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u 
    JOIN admins a ON u.id = a.user_id 
    WHERE u.id = auth.uid()
  )
);

-- ============================================================================
-- 3. ADD ADMIN OVERSIGHT POLICIES FOR LEARNING VISUALIZATIONS
-- ============================================================================

-- Admins can view all learning visualizations for oversight purposes
CREATE POLICY "learning_visualizations_admin_select" ON learning_visualizations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u 
    JOIN admins a ON u.id = a.user_id 
    WHERE u.id = auth.uid()
  )
);

-- ============================================================================
-- 4. ADD ADMIN OVERSIGHT POLICIES FOR FEEDBACK
-- ============================================================================

-- Note: The feedback table already has an admin policy in 0004_update_feedback_table_user_auth.sql
-- Adding a check policy to ensure feedback insertions work from server-side (service role bypasses RLS)
-- No changes needed here as service role key is used for feedback submission

-- ============================================================================
-- 5. ADD ADMIN OVERSIGHT POLICIES FOR CREDIT TRANSACTIONS
-- ============================================================================

-- Admins can view all credit transactions for oversight
CREATE POLICY "credit_transactions_admin_select" ON credit_transactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u 
    JOIN admins a ON u.id = a.user_id 
    WHERE u.id = auth.uid()
  )
);

-- ============================================================================
-- 6. ADD ADMIN OVERSIGHT POLICIES FOR CHATS
-- ============================================================================

-- Ensure admins can see all chats (may already exist from enable_rls_migration.sql)
-- This is a safety check - if policy exists, it will be skipped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'chats_admin_all' AND tablename = 'chats'
  ) THEN
    CREATE POLICY "chats_admin_all" ON chats
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM users u 
        JOIN admins a ON u.id = a.user_id 
        WHERE u.id = auth.uid()
      )
    );
  END IF;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
/*
This migration addresses the following security issues:

1. Organizations: Members can now see organizations they belong to (not just owners)
2. Learning Sessions: Admins can view all sessions for oversight
3. Learning Visualizations: Admins can view all visualizations for oversight
4. Credit Transactions: Admins can view all transactions for auditing
5. Chats: Ensured admin oversight policy exists

Note: The feedback table INSERT policy requires auth.uid() = user_id, but 
server-side operations use the service role key which bypasses RLS entirely.
This is acceptable because:
- Feedback is submitted from authenticated users via the API
- The API validates the user session before submitting
- Service role is only used on the server, never exposed to clients
*/

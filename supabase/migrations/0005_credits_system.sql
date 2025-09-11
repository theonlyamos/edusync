-- Credits System Migration
-- Add credit fields to users table and create related tables

-- Add credit fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits integer DEFAULT 60;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_credits_purchased integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_credits_used integer DEFAULT 0;

-- Update existing users to have 60 credits if they have less
UPDATE users SET credits = 60 WHERE credits < 60 OR credits IS NULL;

-- Create credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'bonus')),
  credits integer NOT NULL, -- positive for additions, negative for usage
  description text NOT NULL,
  session_id uuid REFERENCES learning_sessions(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON credit_transactions (transaction_type, created_at DESC);

-- RLS policies
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "credit_transactions_select_own" ON credit_transactions;
DROP POLICY IF EXISTS "credit_transactions_insert_own" ON credit_transactions;

-- Create new policies
CREATE POLICY "credit_transactions_select_own" ON credit_transactions 
FOR SELECT USING (auth.uid()::uuid = user_id);

CREATE POLICY "credit_transactions_insert_own" ON credit_transactions 
FOR INSERT WITH CHECK (auth.uid()::uuid = user_id);

-- Initialize credits for existing users who don't have the welcome bonus transaction
INSERT INTO credit_transactions (user_id, transaction_type, credits, description)
SELECT 
    id,
    'bonus',
    60,
    'Welcome bonus - 60 free credits'
FROM users 
WHERE id NOT IN (
    SELECT DISTINCT user_id 
    FROM credit_transactions 
    WHERE transaction_type = 'bonus' 
    AND description = 'Welcome bonus - 60 free credits'
);

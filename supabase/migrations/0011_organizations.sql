-- Organizations Migration
-- Create organizations table and related tables for organization management

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits integer NOT NULL DEFAULT 0,
  total_credits_purchased integer NOT NULL DEFAULT 0,
  total_credits_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create organization members table
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  credits_allocated integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  invitation_accepted_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(organization_id, user_id)
);

-- Create organization invitations table
CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Update embed_api_keys to be organization-scoped
ALTER TABLE embed_api_keys ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON organizations (owner_id);
CREATE INDEX IF NOT EXISTS organization_members_org_id_idx ON organization_members (organization_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_invitations_org_id_idx ON organization_invitations (organization_id);
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON organization_invitations (email);
CREATE INDEX IF NOT EXISTS organization_invitations_token_idx ON organization_invitations (token);
CREATE INDEX IF NOT EXISTS embed_api_keys_org_id_idx ON embed_api_keys (organization_id);

-- RLS policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;
DROP POLICY IF EXISTS "organizations_insert_own" ON organizations;
DROP POLICY IF EXISTS "organizations_update_owner" ON organizations;
DROP POLICY IF EXISTS "organizations_delete_owner" ON organizations;

CREATE POLICY "organizations_select_member" ON organizations 
FOR SELECT USING (
  auth.uid()::uuid = owner_id
);

CREATE POLICY "organizations_insert_own" ON organizations 
FOR INSERT WITH CHECK (auth.uid()::uuid = owner_id);

CREATE POLICY "organizations_update_owner" ON organizations 
FOR UPDATE USING (
  auth.uid()::uuid = owner_id
);

CREATE POLICY "organizations_delete_owner" ON organizations 
FOR DELETE USING (auth.uid()::uuid = owner_id);

-- Organization members policies
DROP POLICY IF EXISTS "organization_members_select_member" ON organization_members;
DROP POLICY IF EXISTS "organization_members_insert_admin" ON organization_members;
DROP POLICY IF EXISTS "organization_members_update_admin" ON organization_members;
DROP POLICY IF EXISTS "organization_members_delete_admin" ON organization_members;

CREATE POLICY "organization_members_select_member" ON organization_members 
FOR SELECT USING (
  user_id = auth.uid()::uuid OR 
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_members_insert_admin" ON organization_members 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_members_update_admin" ON organization_members 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_members_delete_admin" ON organization_members 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

-- Organization invitations policies
DROP POLICY IF EXISTS "organization_invitations_select_member" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_insert_admin" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_update_admin" ON organization_invitations;
DROP POLICY IF EXISTS "organization_invitations_delete_admin" ON organization_invitations;

CREATE POLICY "organization_invitations_select_member" ON organization_invitations 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_invitations.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_invitations_insert_admin" ON organization_invitations 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_invitations.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_invitations_update_admin" ON organization_invitations 
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_invitations.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

CREATE POLICY "organization_invitations_delete_admin" ON organization_invitations 
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM organizations 
    WHERE organizations.id = organization_invitations.organization_id 
    AND organizations.owner_id = auth.uid()::uuid
  )
);

-- Function to automatically create owner member when organization is created
CREATE OR REPLACE FUNCTION create_organization_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role, is_active)
  VALUES (NEW.id, NEW.owner_id, 'owner', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_created_trigger ON organizations;
CREATE TRIGGER organization_created_trigger
AFTER INSERT ON organizations
FOR EACH ROW
EXECUTE FUNCTION create_organization_owner_member();

-- Function to update organization updated_at timestamp
CREATE OR REPLACE FUNCTION update_organization_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_updated_trigger ON organizations;
CREATE TRIGGER organization_updated_trigger
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION update_organization_timestamp();


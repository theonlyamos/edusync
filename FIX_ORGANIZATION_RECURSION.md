# Fix: Organization RLS Infinite Recursion

## Problem

When accessing `/api/organizations`, the following error occurred:

```
Error: infinite recursion detected in policy for relation "organization_members"
```

## Root Cause

The RLS policies had a circular dependency:

1. **organizations_select_member** policy checked `organization_members` table
2. This triggered **organization_members_select_member** policy
3. Which called `is_organization_member()` function
4. Which queried `organization_members` again
5. Which triggered the policy again → **Infinite recursion!**

### Original Problematic Policy

```sql
-- organizations table
CREATE POLICY "organizations_select_member" ON organizations 
FOR SELECT USING (
  auth.uid() = owner_id OR 
  EXISTS (
    SELECT 1 FROM organization_members  -- ❌ This causes recursion!
    WHERE organization_members.organization_id = organizations.id 
    AND organization_members.user_id = auth.uid()
    AND organization_members.is_active = true
  )
);
```

## Solution

**Simplified the RLS policies** to avoid circular dependencies and moved the membership logic to the application layer.

### Updated Policies

```sql
-- Organizations: Only show organizations where user is the owner
CREATE POLICY "organizations_select_member" ON organizations 
FOR SELECT USING (
  auth.uid() = owner_id  -- ✅ Simple, no recursion
);

-- Organization members: Show user's own memberships OR memberships in orgs they own
CREATE POLICY "organization_members_select_member" ON organization_members 
FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM organizations  -- ✅ Safe: organizations policy doesn't query back
    WHERE organizations.id = organization_members.organization_id 
    AND organizations.owner_id = auth.uid()
  )
);
```

### Updated API Route Logic

Instead of relying on RLS to join tables, the API route now:

1. **First:** Queries `organization_members` to get user's memberships
2. **Then:** Queries `organizations` table with the specific org IDs
3. **Finally:** Combines the results

```typescript
// Step 1: Get memberships
const { data: memberships } = await supabase
  .from('organization_members')
  .select('organization_id, role')
  .eq('user_id', session.user.id)
  .eq('is_active', true);

// Step 2: Get organizations by IDs
const orgIds = memberships.map(m => m.organization_id);
const { data: organizations } = await supabase
  .from('organizations')
  .select('*')
  .in('id', orgIds);

// Step 3: Combine results
const orgsWithRoles = organizations.map(org => ({
  ...org,
  user_role: memberships.find(m => m.organization_id === org.id)?.role
}));
```

## Files Changed

1. **supabase/migrations/0011_organizations.sql** - Updated original migration
2. **supabase/migrations/0012_fix_organization_recursion.sql** - Fix migration (apply this if 0011 was already applied)
3. **src/app/api/organizations/route.ts** - Updated API logic

## How to Apply the Fix

### If you haven't applied the migration yet:
Just apply the updated `0011_organizations.sql` migration.

### If you've already applied migration 0011:
Apply the fix migration:

```bash
# Apply via Supabase CLI
supabase migration apply

# Or run the SQL directly in Supabase Dashboard SQL Editor
# File: supabase/migrations/0012_fix_organization_recursion.sql
```

## Testing

After applying the fix:

1. Navigate to `/learn/org`
2. Create an organization
3. Verify no recursion errors
4. Add members to the organization
5. Verify members can see the organization

## Key Takeaways

1. **Avoid circular RLS policies** - Don't have table A's policy check table B if table B's policy checks table A
2. **Keep RLS simple** - Complex joins are better handled in application code
3. **SECURITY DEFINER functions don't always prevent recursion** - They still trigger RLS when called from within a policy
4. **Test RLS thoroughly** - Recursion errors only appear when policies are actually triggered

## Architecture Decision

We chose to **simplify RLS and handle complex authorization in the API layer** rather than using complex RLS policies. This provides:

- ✅ Better performance (fewer nested queries)
- ✅ Easier debugging
- ✅ More flexibility for complex business logic
- ✅ No recursion issues

The RLS still provides **row-level security** (users can only see their own membership records and owned organizations), while the API layer handles **feature-level authorization** (determining which organizations to display based on membership).


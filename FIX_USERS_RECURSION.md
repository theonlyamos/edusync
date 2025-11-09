# Fix: Users Table RLS Infinite Recursion

## Problem

After fixing the organization recursion, a new error occurred when accessing organization details:

```
Error: infinite recursion detected in policy for relation "users"
```

## Root Cause

The API routes were using **Supabase joins** to fetch user details along with organization members:

```typescript
// This causes recursion!
.select(`
  *,
  organization_members!inner(
    ...
    users:user_id(id, name, email)  // ❌ This join triggers users RLS policies
  )
`)
```

When this join executes:
1. Supabase applies RLS policies on the `users` table
2. The `users_admin_select_all` policy runs: `EXISTS (SELECT 1 FROM users u JOIN admins a ...)`
3. This queries the `users` table again
4. Which triggers the same policy → **Infinite recursion!**

### Problematic Existing Policies

```sql
-- This policy queries the users table within itself
CREATE POLICY "users_admin_select_all" ON users
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM users u  -- ❌ Recursion!
    JOIN admins a ON (u.id = a.user_id)
    WHERE u.id = auth.uid()
  )
);
```

## Solution

**Separate the queries** - fetch organization data and user data in independent queries, then combine in the application layer.

### Updated API Pattern

```typescript
// ✅ Step 1: Fetch members WITHOUT user join
const { data: members } = await supabase
  .from('organization_members')
  .select('*')  // No user join!
  .eq('organization_id', id);

// ✅ Step 2: Fetch users separately
const userIds = members?.map(m => m.user_id) || [];
const { data: users } = await supabase
  .from('users')
  .select('id, name, email')
  .in('id', userIds);

// ✅ Step 3: Combine in application layer
const membersWithUsers = members?.map(member => ({
  ...member,
  users: users?.find(u => u.id === member.user_id)
}));
```

## Files Changed

### 1. Migration File
**supabase/migrations/0013_fix_users_recursion.sql**
- Added `users_select_basic_public_info` policy to allow viewing basic user info
- Documented the issue and solution

### 2. API Routes Updated

**src/app/api/organizations/[id]/route.ts**
- Separated organization, members, and users queries
- Combine data in application layer

**src/app/api/organizations/[id]/members/route.ts**
- GET: Fetch members and users separately
- POST: Fetch new member's user details separately

**src/app/api/organizations/[id]/members/[memberId]/route.ts**
- PATCH: Fetch updated member's user details separately

## How to Apply

1. **Apply the migration:**
```bash
# Run in Supabase Dashboard SQL Editor or via CLI
supabase/migrations/0013_fix_users_recursion.sql
```

2. **The API route changes are already in the code** - no additional action needed

## Benefits of This Approach

✅ **No RLS recursion** - Queries don't trigger circular policy checks
✅ **Better performance** - Can optimize each query independently
✅ **More flexible** - Easier to add caching, pagination, etc.
✅ **Easier debugging** - Clear separation of concerns
✅ **Works with existing policies** - Don't need to modify complex existing RLS policies

## Alternative Approaches Considered

### ❌ Option 1: Remove recursive policies
- Would require rewriting all existing user policies
- Risky - might break other parts of the app
- Not backwards compatible

### ❌ Option 2: Use SECURITY DEFINER functions
- Still triggers RLS in some cases
- Complex to maintain
- Doesn't solve the root cause

### ✅ Option 3: Separate queries (chosen)
- Clean separation of concerns
- Works with existing policies
- Better performance
- Easy to understand and maintain

## Testing

After applying the fix:
1. Navigate to `/learn/org` ✅
2. Create an organization ✅
3. View organization details ✅
4. Add members to the organization ✅
5. Update member roles ✅
6. Allocate credits to members ✅

All operations should work without recursion errors!

## Key Takeaway

**Avoid RLS joins when tables have self-referential policies.** Instead:
- Fetch data in separate queries
- Combine in the application layer
- Keep RLS policies simple and non-recursive


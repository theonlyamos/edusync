# Organization Management System

## Overview

A comprehensive organization management system has been added to the learn path, allowing users to create organizations, manage team members, allocate credits, and control API keys at the organization level.

## Features

### 1. **Organization Creation & Management**
- Users can create multiple organizations
- Organizations have their own credit pools
- Organization owners can update organization details
- Track total credits purchased and used

### 2. **Member Management**
- Three role types:
  - **Owner**: Full control over the organization (created automatically for the organization creator)
  - **Admin**: Can manage members, API keys, and allocate credits
  - **Member**: Basic member with allocated credits
- Add members by email
- Remove members (except owner)
- Change member roles
- Track member activity and credit usage

### 3. **Credit Allocation**
- Organization admins and owners can allocate credits to members
- Credits are deducted from the organization pool
- Track credits allocated vs. credits used per member
- Support for purchasing organization credits

### 4. **API Key Management**
- API keys can be scoped to organizations
- Organization admins and owners can create/manage organization API keys
- Credits for API usage are deducted from the organization pool
- Support for both personal and organization API keys

## Database Schema

### New Tables

#### `organizations`
```sql
- id: uuid (primary key)
- name: text
- description: text
- owner_id: uuid (references users)
- credits: integer
- total_credits_purchased: integer
- total_credits_used: integer
- is_active: boolean
- settings: jsonb
- created_at: timestamptz
- updated_at: timestamptz
```

#### `organization_members`
```sql
- id: uuid (primary key)
- organization_id: uuid (references organizations)
- user_id: uuid (references users)
- role: text (owner, admin, member)
- credits_allocated: integer
- credits_used: integer
- joined_at: timestamptz
- invited_by: uuid (references users)
- invitation_accepted_at: timestamptz
- is_active: boolean
```

#### `organization_invitations`
```sql
- id: uuid (primary key)
- organization_id: uuid (references organizations)
- email: text
- role: text (admin, member)
- invited_by: uuid (references users)
- token: text (unique)
- expires_at: timestamptz
- accepted_at: timestamptz
- created_at: timestamptz
```

### Updated Tables

#### `embed_api_keys`
- Added `organization_id` column (nullable, references organizations)
- API keys can now be associated with an organization or a user

## API Routes

### Organizations

#### `GET /api/organizations`
- List all organizations the user is a member of
- Returns organization details with member information

#### `POST /api/organizations`
- Create a new organization
- Body: `{ name, description }`
- Automatically creates owner membership

#### `GET /api/organizations/:id`
- Get detailed organization information
- Includes all members and their details

#### `PATCH /api/organizations/:id`
- Update organization details
- Requires owner or admin role
- Body: `{ name?, description?, is_active? }`

#### `DELETE /api/organizations/:id`
- Delete an organization
- Requires owner role only

### Organization Members

#### `GET /api/organizations/:id/members`
- List all members of an organization
- Includes user details

#### `POST /api/organizations/:id/members`
- Add a new member to the organization
- Requires owner or admin role
- Body: `{ user_id, role, credits_allocated }`

#### `PATCH /api/organizations/:id/members/:memberId`
- Update member details
- Requires owner or admin role
- Body: `{ role?, credits_allocated?, is_active? }`

#### `DELETE /api/organizations/:id/members/:memberId`
- Remove a member from the organization
- Requires owner or admin role
- Cannot remove the owner

### Credit Allocation

#### `POST /api/organizations/:id/credits`
- Allocate credits to a member
- Requires owner or admin role
- Body: `{ member_id, credits }`
- Validates sufficient organization credits

### Users

#### `GET /api/users/search`
- Search for users by email
- Query param: `email`
- Used when adding members to organizations

## UI Pages

### `/learn/org`
Organization listing and creation page

**Features:**
- If user has no organizations, shows creation form
- If user has one organization, redirects to that organization
- If user has multiple organizations, shows a list to select from
- Create new organization button

### `/learn/org/:orgId`
Organization detail and management page

**Tabs:**

1. **Members**
   - View all organization members
   - Add new members by email
   - Update member roles
   - Allocate credits to members
   - Remove members
   - Track member activity

2. **API Keys**
   - Link to organization-scoped API keys page
   - Create organization API keys
   - View API key usage

3. **Settings**
   - View credit statistics
   - Purchase organization credits
   - Update organization details

### `/learn/api-keys?organization_id=:id`
API keys management with organization context

**Features:**
- Create API keys scoped to the organization
- View and manage organization API keys
- Copy embed codes
- Track API key usage
- Enable/disable keys
- Delete keys

## Navigation

The organization link has been added to the learn layout sidebar:
- Desktop: Sidebar with "Organization" button
- Mobile: Hamburger menu with "Organization" button
- Links to `/learn/org`

## Usage Examples

### Creating an Organization

1. Navigate to `/learn/org`
2. Fill in the organization name and description
3. Click "Create Organization"
4. You'll be automatically redirected to the organization page

### Adding Members

1. Go to your organization page
2. Click the "Members" tab
3. Click "Add Member"
4. Enter the user's email address
5. Select their role (Admin or Member)
6. Click "Add Member"

### Allocating Credits

1. Go to your organization page
2. Click the "Members" tab
3. Find the member you want to allocate credits to
4. Click "Allocate" next to their name
5. Enter the number of credits
6. Click "Allocate"

### Creating Organization API Keys

1. Go to your organization page
2. Click the "API Keys" tab
3. Click "Create API Key" or navigate to the API keys page
4. Fill in the API key details
5. The API key will be scoped to your organization
6. Credits will be deducted from the organization pool

## Security

- Row Level Security (RLS) policies enforce access control
- Only organization members can view organization details
- Only owners and admins can manage members and API keys
- Only owners can delete organizations
- API key creation requires owner/admin role for organizations
- Credit allocation validates sufficient organization credits

## Database Triggers

### `create_organization_owner_member()`
Automatically creates an owner membership when an organization is created

### `update_organization_timestamp()`
Updates the `updated_at` timestamp when an organization is modified

## Future Enhancements

Potential features to add:
- Email invitations for members
- Organization billing and invoicing
- Audit logs for organization actions
- Organization usage analytics
- Credit purchase plans
- Organization-level settings and preferences
- Member permissions customization
- Bulk member operations
- Organization transfer ownership
- Organization archiving

## Migration

To apply the organization management feature:

```bash
# The migration file is located at:
# supabase/migrations/0011_organizations.sql

# Apply the migration using your Supabase client or dashboard
```

## Testing

Test the following scenarios:
1. Create an organization
2. Add members with different roles
3. Allocate credits to members
4. Create organization API keys
5. Update organization details
6. Remove members
7. Change member roles
8. View credit usage statistics
9. Test access control (non-members should not access)
10. Test organization API key credit deduction


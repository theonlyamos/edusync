# Feedback Database Setup

This directory contains SQL scripts for setting up the feedback collection system in your Supabase database.

## Quick Setup

### 1. Create the Table in Supabase

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `supabase_feedback_table.sql`
5. Click **Run** to create the table and indexes

### 2. Verify Environment Variables

Make sure these environment variables are set in your `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Test the Integration

The feedback form will automatically appear when users:

- Stop/cancel voice sessions manually
- Experience connection resets (~10 minutes)
- Encounter errors

## Database Schema

The `feedback` table stores:

| Column                     | Type        | Description                                    |
| -------------------------- | ----------- | ---------------------------------------------- |
| `id`                       | BIGSERIAL   | Primary key                                    |
| `rating`                   | VARCHAR(10) | User rating: 'positive', 'neutral', 'negative' |
| `experience`               | TEXT        | Optional user experience description           |
| `improvements`             | TEXT        | Optional improvement suggestions               |
| `would_recommend`          | VARCHAR(10) | 'yes', 'no', 'maybe'                           |
| `trigger_type`             | VARCHAR(20) | 'manual_stop', 'connection_reset', 'error'     |
| `user_agent`               | TEXT        | Browser/device information                     |
| `timestamp`                | TIMESTAMPTZ | When feedback was submitted                    |
| `session_duration_seconds` | INTEGER     | Session length (optional)                      |
| `connection_count`         | INTEGER     | Number of connections (optional)               |
| `error_message`            | TEXT        | Error details if applicable                    |
| `created_at`               | TIMESTAMPTZ | Record creation time                           |
| `updated_at`               | TIMESTAMPTZ | Last update time                               |

## Analyzing Feedback

Use the queries in `feedback_queries.sql` to analyze collected feedback:

### Common Analysis Queries

```sql
-- Overall satisfaction breakdown
SELECT rating, COUNT(*) as count
FROM feedback
GROUP BY rating;

-- Feedback by trigger type
SELECT trigger_type, COUNT(*) as count
FROM feedback
GROUP BY trigger_type;

-- Recent feedback with comments
SELECT rating, experience, improvements, created_at
FROM feedback
WHERE experience IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## Security

The table uses Row Level Security (RLS) with policies that:

- Allow API inserts (for collecting feedback)
- Allow admin reads (for analysis)

You can modify the policies in Supabase Dashboard > Authentication > Policies.

## Data Retention

Consider implementing a data retention policy. The queries file includes a commented DELETE statement for removing old feedback after 6 months.

## Files

- `supabase_feedback_table.sql` - Main table creation script for Supabase
- `create_feedback_table.sql` - Generic PostgreSQL version
- `feedback_queries.sql` - Analysis and reporting queries
- `README.md` - This documentation

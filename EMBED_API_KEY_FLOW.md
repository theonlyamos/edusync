# API Key Embed Flow - Complete Architecture

## 🎯 How Credit Deduction Works with API Keys

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Developer's Website                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │  <iframe src="insyteai.com/embed?apiKey=isk_abc123">          │  │
│  │                                                                 │  │
│  │    ┌──────────────────────────────────────────────┐           │  │
│  │    │  [Start AI Session Button]                   │           │  │
│  │    │                                               │           │  │
│  │    │  Student: "Explain photosynthesis"          │           │  │
│  │    │  AI: [Generates visualization + explains]    │           │  │
│  │    │                                               │           │  │
│  │    │  ⏱️  Every 60 seconds → Deduct 1 credit     │           │  │
│  │    │     from Developer's account                 │           │  │
│  │    └──────────────────────────────────────────────┘           │  │
│  │                                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  💳 Credits deducted from: Developer (not the end user)             │
└─────────────────────────────────────────────────────────────────────┘
```

## 📊 Database Schema

### Tables

#### 1. `embed_api_keys`
Stores API keys created by developers

```sql
- id: UUID (primary key)
- user_id: UUID → links to the developer's account
- api_key: TEXT (isk_xxxxx format)
- name: TEXT (human-readable name)
- allowed_domains: TEXT[] (domain whitelist)
- is_active: BOOLEAN
- total_requests: INTEGER (tracking)
- total_minutes_used: INTEGER (billing metric)
- rate_limit_per_hour: INTEGER
- rate_limit_per_day: INTEGER
- created_at: TIMESTAMPTZ
- expires_at: TIMESTAMPTZ
```

#### 2. `learning_sessions` (updated)
Tracks which sessions are created via API

```sql
# New columns added:
- api_key_id: UUID → links to embed_api_keys
- is_embedded: BOOLEAN → true for API-created sessions
```

#### 3. `user_credits` (existing)
Stores credits for each user

```sql
- user_id: UUID
- credits: INTEGER
```

## 🔄 Complete Request Flow

### Step 1: Developer Creates API Key

```
Developer Dashboard
    ↓
POST /api/embed/keys
    {
      name: "Production Site",
      allowed_domains: ["example.com", "*.example.com"]
    }
    ↓
Server generates: isk_abc123...
    ↓
Returns API key to developer (only shown once!)
```

### Step 2: Developer Embeds iframe

```html
<!-- On developer's website -->
<iframe 
  src="https://insyteai.com/session/embed/new?apiKey=isk_abc123"
  allow="microphone">
</iframe>
```

### Step 3: End User Starts Session

```
User clicks "Start Session" in iframe
    ↓
Iframe JavaScript: POST /api/embed/sessions
    Headers: { Authorization: "Bearer isk_abc123" }
    Body: { topic: "Photosynthesis" }
    ↓
Backend validates API key:
    ✓ Key exists and is active
    ✓ Domain matches whitelist
    ✓ Rate limit not exceeded
    ✓ Developer has ≥1 credit
    ↓
Backend creates session:
    INSERT INTO learning_sessions (
      user_id: <developer's user_id>,
      api_key_id: <api_key.id>,
      is_embedded: true,
      status: 'active'
    )
    ↓
Returns: { sessionId: "uuid-here" }
```

### Step 4: AI Interaction (60 seconds pass)

```
Every minute while session is active:
    ↓
Iframe JavaScript: POST /api/embed/credits/deduct-minute
    Headers: { Authorization: "Bearer isk_abc123" }
    Body: { sessionId: "uuid-here" }
    ↓
Backend validates:
    ✓ API key is valid
    ✓ Session belongs to this API key
    ✓ Developer has credits available
    ↓
Deduct from developer's account:
    UPDATE user_credits
    SET credits = credits - 1
    WHERE user_id = <api_key.user_id>
    ↓
Update API key metrics:
    UPDATE embed_api_keys
    SET total_minutes_used = total_minutes_used + 1
    WHERE id = <api_key_id>
    ↓
Return: { 
      success: true, 
      remainingCredits: 95 
    }
```

### Step 5: Out of Credits

```
If remainingCredits <= 0:
    ↓
Backend returns: { 
      success: false, 
      error: "Insufficient credits" 
    }
    Status: 402 Payment Required
    ↓
Iframe JavaScript receives error
    ↓
Automatically stops voice session
    ↓
Shows message: "Session ended: No credits remaining"
    ↓
Updates session status:
    UPDATE learning_sessions
    SET status = 'ended', ended_at = NOW()
    WHERE id = <sessionId>
```

## 🔒 Security Layers

### Layer 1: API Key Validation

```typescript
validateApiKey(request) {
  1. Extract key from: Authorization header OR ?apiKey param
  2. Check format: must start with "isk_"
  3. Query database: find key in embed_api_keys
  4. Verify: is_active = true
  5. Verify: expires_at is NULL or > NOW()
  6. Return: { valid: true, userId, apiKeyId }
}
```

### Layer 2: Domain Whitelisting

```typescript
const origin = request.headers.get('origin');
const domain = extractDomain(origin); // "app.example.com"

if (apiKey.allowed_domains) {
  // Check exact match or wildcard
  const allowed = apiKey.allowed_domains.some(pattern => {
    if (pattern === '*.example.com') {
      return domain.endsWith('.example.com');
    }
    return domain === pattern;
  });
  
  if (!allowed) {
    return { error: "Domain not allowed" };
  }
}
```

### Layer 3: Rate Limiting

```typescript
// Future implementation
checkRateLimit(apiKeyId) {
  // Count requests in last hour
  // Compare to rate_limit_per_hour
  // Return: { allowed: boolean }
}
```

### Layer 4: Session Ownership

```typescript
// Verify session belongs to API key before deducting credits
const session = await db.learning_sessions
  .select()
  .where({ id: sessionId, api_key_id: apiKeyId });

if (!session) {
  return { error: "Session not found or unauthorized" };
}
```

## 💰 Billing Logic

### Credit Calculation

```
1 Credit = 1 Minute of Active AI Time

Active AI Time includes:
  ✓ Voice conversation with AI
  ✓ Real-time visualization generation
  ✓ Text chat with AI

NOT included:
  ✗ Loading time
  ✗ Paused sessions
  ✗ Viewing past visualizations (replay mode)
```

### Credit Deduction Flow

```javascript
// Client-side (in iframe)
const interval = setInterval(async () => {
  const response = await fetch('/api/embed/credits/deduct-minute', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${apiKey}` 
    },
    body: JSON.stringify({ sessionId })
  });

  const data = await response.json();
  
  if (!data.success) {
    // Out of credits
    clearInterval(interval);
    stopSession();
    showError(data.error);
  } else {
    // Update credit display
    updateCreditsUI(data.remainingCredits);
    
    // Warn if low
    if (data.remainingCredits <= 5) {
      showWarning(`Only ${data.remainingCredits} minutes remaining`);
    }
  }
}, 60000); // Every 60 seconds
```

## 📈 Tracking & Analytics

### Metrics Available to Developers

In the API Keys dashboard, developers can see:

1. **Total Requests**: Number of API calls made
2. **Total Minutes Used**: Total AI time consumed (= total credits used)
3. **Last Used**: When the key was last used
4. **Active Sessions**: Current ongoing sessions (future feature)
5. **Cost Estimate**: Minutes × cost per minute

### Example Dashboard Query

```typescript
// GET /api/embed/keys
{
  apiKeys: [
    {
      id: "uuid",
      name: "Production Site",
      total_requests: 1523,
      total_minutes_used: 847, // = 847 credits used
      last_used_at: "2024-01-15T14:30:00Z",
      rate_limit_per_hour: 100,
      is_active: true
    }
  ]
}
```

## 🎨 Frontend Components

### 1. API Key Management Page
**Location**: `/session/api-keys`

Features:
- Create new API keys
- View all keys (with masked values)
- Copy keys to clipboard
- Enable/disable keys
- Delete keys
- View usage statistics
- Set domain whitelist

### 2. Embed Page
**Location**: `/session/embed/[id]`

Features:
- Minimal UI optimized for iframes
- Voice control integration
- Automatic credit deduction
- Credit warning when low
- Auto-stop when out of credits
- Theme support (light/dark)

## 🚀 Deployment Checklist

### Database Migration

```bash
# Run the migration
bun supabase migration up

# Or manually execute
psql -f supabase/migrations/0010_embed_api_keys.sql
```

### Environment Variables

```env
# Already configured in your .env
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### CORS Configuration

Ensure your middleware allows iframe embedding:

```typescript
// In middleware.ts
response.headers.set('X-Frame-Options', 'ALLOWALL');
// Or use CSP: frame-ancestors 'self' *.example.com
```

## 📝 Testing

### Test Scenarios

1. **Create API Key**
   - User creates key in dashboard
   - Verify key is generated and stored
   - Verify key is shown only once

2. **Embed Session**
   - Embed iframe with valid API key
   - Start voice session
   - Verify session is created with api_key_id

3. **Credit Deduction**
   - Wait 60 seconds during active session
   - Verify credit is deducted from API key owner
   - Verify total_minutes_used increments

4. **Out of Credits**
   - Set user credits to 0
   - Try to deduct credit
   - Verify 402 error is returned
   - Verify session stops automatically

5. **Domain Whitelist**
   - Set allowed_domains on API key
   - Try to use from different domain
   - Verify request is blocked

6. **Invalid API Key**
   - Use wrong/deleted API key
   - Verify 401 error is returned

## 🔧 Maintenance

### Monitoring

Track these metrics:
- API key creation rate
- Credit deduction failures
- 402 errors (out of credits)
- Domain whitelist violations
- Average session duration

### Cleanup

Periodically:
- Delete expired API keys
- Archive old sessions
- Aggregate usage statistics

## 📞 Support

For developers using your embed API:
- Provide comprehensive documentation
- Show real-time credit balance
- Email alerts for low credits
- Usage analytics dashboard
- Support ticket system


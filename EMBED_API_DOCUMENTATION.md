# InsyteAI Embed API Documentation

## Overview

The InsyteAI Embed API allows you to embed interactive AI learning sessions on your own websites and platforms. Credits are automatically deducted from your InsyteAI account based on usage (1 credit per minute of active AI time).

## Getting Started

### 1. Create an API Key

1. Log in to your InsyteAI account
2. Navigate to **Settings → API Keys**
3. Click **Create New Key**
4. Give it a name and optionally specify allowed domains
5. **Copy your API key** - you won't be able to see it again!

### 2. Choose Your Integration Method

#### Option A: Simple iframe Embed (Easiest)

Embed a session directly using an iframe:

```html
<iframe 
  src="https://insyteai.com/session/embed/new?apiKey=isk_YOUR_API_KEY_HERE&topic=Photosynthesis"
  width="100%" 
  height="600px"
  frameborder="0"
  allow="microphone"
></iframe>
```

**Query Parameters:**
- `apiKey` (required): Your API key
- `topic` (optional): Pre-fill the topic for the session
- `theme` (optional): `light` or `dark`

#### Option B: Create Session via API First

For more control, create a session via API then embed it:

```javascript
// Step 1: Create a session
const response = await fetch('https://insyteai.com/api/embed/sessions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer isk_YOUR_API_KEY_HERE',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'Photosynthesis',
    metadata: { studentId: '12345' } // Optional metadata
  })
});

const { sessionId } = await response.json();

// Step 2: Embed the session
const iframe = document.createElement('iframe');
iframe.src = `https://insyteai.com/session/embed/${sessionId}?apiKey=isk_YOUR_API_KEY_HERE`;
iframe.width = '100%';
iframe.height = '600px';
document.getElementById('session-container').appendChild(iframe);
```

## API Reference

### Authentication

All API requests must include your API key in the `Authorization` header:

```
Authorization: Bearer isk_YOUR_API_KEY_HERE
```

Alternatively, you can pass it as a query parameter:
```
?apiKey=isk_YOUR_API_KEY_HERE
```

### Endpoints

#### `POST /api/embed/sessions`

Create a new embedded session.

**Request:**
```json
{
  "topic": "Photosynthesis",
  "metadata": {} // Optional
}
```

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Embedded session created successfully"
}
```

**Status Codes:**
- `200`: Success
- `401`: Invalid or missing API key
- `402`: Insufficient credits (need at least 1 credit)
- `403`: Domain not allowed (if domain whitelist is configured)

---

#### `GET /api/embed/sessions`

List all sessions created with your API key.

**Query Parameters:**
- `limit` (optional): Maximum number of sessions to return (default: 50)

**Response:**
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "created_at": "2024-01-15T10:30:00Z",
      "topic": "Photosynthesis",
      "status": "active",
      "ended_at": null
    }
  ]
}
```

---

#### `POST /api/embed/credits/deduct-minute`

Deduct 1 credit for a minute of AI usage. **This is called automatically by the embedded session every minute.**

**Request:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "success": true,
  "remainingCredits": 95,
  "message": "Credit deducted successfully"
}
```

**Status Codes:**
- `200`: Success
- `402`: Insufficient credits (session will automatically stop)

---

### Credit System

- **Cost:** 1 credit = 1 minute of active AI voice/chat time
- **Deduction:** Credits are automatically deducted every minute while a session is active
- **Minimum:** You must have at least 1 credit to start a session
- **Warning:** When credits reach 0, active sessions will automatically stop

### Security

#### Domain Whitelisting

You can restrict API keys to specific domains:

1. Go to **API Keys** in your dashboard
2. Edit your API key
3. Add allowed domains (one per line):
   ```
   example.com
   *.example.com
   app.example.com
   ```

4. Wildcard patterns (`*.example.com`) match all subdomains

#### Rate Limiting

Default rate limits:
- **100 requests per hour**
- **1,000 requests per day**

Contact support if you need higher limits.

### Best Practices

#### 1. Secure Your API Key

- **Never** commit API keys to public repositories
- Store keys in environment variables
- Use different keys for development and production
- Rotate keys periodically

#### 2. Monitor Usage

- Check your API key usage regularly in the dashboard
- Set up alerts for low credits
- Monitor the `total_minutes_used` metric

#### 3. Handle Errors Gracefully

```javascript
try {
  const response = await fetch('https://insyteai.com/api/embed/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ topic: 'Biology' })
  });

  if (response.status === 402) {
    alert('Insufficient credits. Please purchase more credits.');
    return;
  }

  if (!response.ok) {
    throw new Error('Failed to create session');
  }

  const data = await response.json();
  // Use data.sessionId
} catch (error) {
  console.error('Error:', error);
  // Show user-friendly error message
}
```

#### 4. Responsive iframes

Make iframes responsive:

```html
<div style="position: relative; padding-bottom: 75%; height: 0; overflow: hidden;">
  <iframe 
    src="https://insyteai.com/session/embed/..."
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
    frameborder="0"
    allow="microphone"
  ></iframe>
</div>
```

### Example: React Component

```tsx
import { useState, useEffect } from 'react';

export function EmbeddedSession({ apiKey, topic }) {
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function createSession() {
      try {
        const response = await fetch('https://insyteai.com/api/embed/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ topic })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create session');
        }

        const data = await response.json();
        setSessionId(data.sessionId);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    createSession();
  }, [apiKey, topic]);

  if (loading) return <div>Loading session...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <iframe
      src={`https://insyteai.com/session/embed/${sessionId}?apiKey=${apiKey}`}
      width="100%"
      height="600px"
      frameBorder="0"
      allow="microphone"
    />
  );
}
```

### Troubleshooting

#### "Invalid API key" Error

- Verify your API key is correct
- Check that the key hasn't been disabled or deleted
- Ensure you're using the correct format: `Bearer isk_...`

#### "Domain not allowed" Error

- Check your API key's domain whitelist
- Verify the request is coming from an allowed domain
- Use wildcards (`*.example.com`) to allow subdomains

#### "Insufficient credits" Error

- Purchase more credits from your dashboard
- Monitor your credit usage to avoid interruptions

#### Sessions Not Starting

- Ensure you have at least 1 credit available
- Check browser console for errors
- Verify microphone permissions are granted
- Check that `allow="microphone"` is set on the iframe

### Support

- **Documentation:** https://docs.insyteai.com
- **Email:** support@insyteai.com
- **Dashboard:** https://insyteai.com/dashboard

### Changelog

- **v1.0** (2024-01-15): Initial release
  - Session creation via API
  - iframe embedding
  - Automatic credit deduction
  - Domain whitelisting
  - Rate limiting


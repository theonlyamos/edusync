import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

export async function mintLiveKitParticipantToken(params: {
  roomName: string
  participantIdentity: string
  participantName?: string
  ttlSeconds?: number
}): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET')
  }

  const { roomName, participantIdentity, participantName, ttlSeconds = 3600 } = params

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantIdentity,
    name: participantName || participantIdentity,
    ttl: ttlSeconds,
  })

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  return token.toJwt()
}

export function getLiveKitWsUrl(): string {
  const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL
  if (!url) throw new Error('Missing LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL')
  return url
}

/** Room Service API expects https host, not wss. */
export function getLiveKitHttpHost(): string {
  const url = getLiveKitWsUrl().trim()
  if (url.startsWith('wss://')) return `https://${url.slice(6)}`
  if (url.startsWith('ws://')) return `http://${url.slice(5)}`
  return url
}

/**
 * Ensure the LiveKit room exists with metadata the agent reads (`learning_session_id`).
 * Create if missing; update metadata if the room already exists.
 */
export async function ensureLiveKitRoomSessionMetadata(roomName: string, learningSessionId: string): Promise<void> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) return

  const host = getLiveKitHttpHost()
  const client = new RoomServiceClient(host, apiKey, apiSecret)
  const metadata = JSON.stringify({ learning_session_id: learningSessionId })

  try {
    await client.createRoom({
      name: roomName,
      metadata,
      emptyTimeout: 600,
      maxParticipants: 50,
    })
  } catch {
    try {
      await client.updateRoomMetadata(roomName, metadata)
    } catch (e) {
      console.warn('[LiveKit] could not set room metadata (room may not exist yet):', e)
    }
  }
}

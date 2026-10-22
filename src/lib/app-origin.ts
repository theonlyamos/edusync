import type { NextRequest } from 'next/server'

/** Base URL for links in emails: APP_URL when set, otherwise the request's own origin. */
export function appOrigin(request: NextRequest): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  return (configured || request.nextUrl.origin).replace(/\/+$/, '')
}

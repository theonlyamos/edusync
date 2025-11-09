import { NextRequest } from 'next/server';

export interface AuthContext {
  userId: string;
  authType: 'session' | 'apiKey';
  apiKeyId?: string;
  userRole?: string | null;
}

export function getAuthContext(request: NextRequest): AuthContext | null {
  const userId = request.headers.get('x-auth-user-id');
  const authType = request.headers.get('x-auth-type') as 'session' | 'apiKey' | null;
  const apiKeyId = request.headers.get('x-auth-api-key-id');
  const userRole = request.headers.get('x-auth-user-role');

  if (!userId || !authType) {
    return null;
  }

  return {
    userId,
    authType,
    apiKeyId: apiKeyId || undefined,
    userRole: userRole || null,
  };
}


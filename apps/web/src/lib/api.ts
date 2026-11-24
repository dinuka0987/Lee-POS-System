import { healthResponseSchema, type HealthResponse } from '@lee/shared';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15_000),
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('Connection lost. Check your network and retry the same sale.', 0);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      'The server is unavailable. Saved sales will retry automatically.',
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('lee-session-expired'));
    throw new ApiError(
      Array.isArray(data.message) ? data.message.join('. ') : data.message || 'Request failed',
      response.status,
    );
  }
  return data as T;
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, {
    signal: signal ?? null,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
  return healthResponseSchema.parse(await response.json());
}

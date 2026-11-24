import { z } from 'zod';
import type { User } from '@lee/shared';
const sessionSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    role: z.enum(['admin', 'cashier']),
    branchId: z.uuid(),
  }),
});
const key = 'lee-pos-session-v1';
export type Session = { accessToken: string; user: User };
export function sessionExpiry(token: string): number {
  try {
    const part = token.split('.')[1]!;
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
export function readSession(): Session | null {
  try {
    const parsed = sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(key) || 'null'));
    return parsed.success && sessionExpiry(parsed.data.accessToken) > Date.now()
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
export function validSession() {
  return !!readSession();
}
export function saveSession(session: Session) {
  sessionStorage.setItem(key, JSON.stringify(session));
}
export function clearSession() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* The in-memory session is still cleared by its provider. */
  }
}

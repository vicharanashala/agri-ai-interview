/**
 * Deactivated-account (Admin Trash Bin) handling shared by the candidate login, post-login and fetch helpers.
 *
 * The backend answers HTTP 403 with
 *   {"detail": {"code": "ACCOUNT_DEACTIVATED", "message": "..."}}
 * when a candidate in the Trash Bin signs in (after a correct password) or calls a candidate API.
 */

export const ACCOUNT_DEACTIVATED_CODE = 'ACCOUNT_DEACTIVATED';
export const ACCOUNT_DEACTIVATED_MESSAGE = 'Your account has been deactivated. Please contact the administrator.';
/** Query value on /login that shows the deactivated-account message after a forced sign-out. */
export const ACCOUNT_DEACTIVATED_REASON = 'deactivated';

/**
 * True for an ACCOUNT_DEACTIVATED error body: the backend shape, `{code}` at the top level, or a proxy that
 * re-wrapped the backend detail as `{error: detail}`.
 */
export function isAccountDeactivatedBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { code?: unknown; detail?: unknown; error?: unknown };
  if (b.code === ACCOUNT_DEACTIVATED_CODE) return true;
  return [b.detail, b.error].some(
    (inner) => !!inner && typeof inner === 'object' && (inner as { code?: unknown }).code === ACCOUNT_DEACTIVATED_CODE
  );
}

/** True when a response is a 403 ACCOUNT_DEACTIVATED. Reads a clone, so the caller can still read the body. */
export async function isAccountDeactivatedResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = await res.clone().json().catch(() => null);
  return isAccountDeactivatedBody(body);
}

let signingOut = false;

/**
 * Sign the candidate out of NextAuth and send them to /login with the deactivated-account message.
 * Clearing the NextAuth cookie first matters: middleware sends a signed-in visitor from /login back to
 * /dashboard, so redirecting without signing out would loop. Runs once even if several requests fail together.
 */
export async function handleAccountDeactivated(): Promise<void> {
  if (typeof window === 'undefined' || signingOut) return;
  signingOut = true;
  const loginUrl = `/login?reason=${ACCOUNT_DEACTIVATED_REASON}`;
  try {
    window.sessionStorage.removeItem('candidate_session_token');
    window.sessionStorage.removeItem('candidate_id');
  } catch {
    // sessionStorage unavailable; nothing to clear
  }
  try {
    const { signOut } = await import('next-auth/react');
    await signOut({ callbackUrl: loginUrl });
  } catch {
    window.location.href = loginUrl;
  }
}

/**
 * Small, deliberately redacted client event surface. Keep payloads operational:
 * never pass user IDs, email addresses, tokens, nutrition details, images, or
 * exported content here. A production sink can replace this implementation
 * without changing the callers' privacy contract.
 */
export type OperationalEvent =
  | 'account_export_started'
  | 'account_export_completed'
  | 'account_export_failed'
  | 'account_delete_started'
  | 'account_delete_completed'
  | 'account_delete_failed'
  | 'preferences_load_failed'
  | 'preferences_save_completed'
  | 'preferences_save_failed'
  | 'sign_out_completed'
  | 'sign_out_failed';

type EventDetails = Record<string, string | number | boolean | undefined>;

export function trackOperationalEvent(event: OperationalEvent, details: EventDetails = {}) {
  if (!__DEV__) return;

  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined)
  );
  console.info('[HaverTrack]', JSON.stringify({ event, at: new Date().toISOString(), ...safeDetails }));
}

export function operationalErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[a-z0-9_-]{1,64}$/i.test(code)) return code;
  }
  return 'operation_failed';
}

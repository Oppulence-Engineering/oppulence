import { isSignedIn } from '../account/account.js';
import { getBillingInfo } from '../billing/billing.js';
import { identify } from './posthog.js';

/**
 * If the user has rowboat OAuth tokens, fetch their billing info and
 * call posthog.identify(). Idempotent — safe to call on every app start.
 * Catches all errors so analytics never blocks app launch.
 */
export async function identifyIfSignedIn(): Promise<void> {
  try {
    if (!(await isSignedIn())) return;
    const billing = await getBillingInfo();
    if (!billing.userId) return;
    // Email is account data in the privacy policy, not usage data. The distinct
    // id is the account id. Do not attach the address.
    identify(billing.userId, {
      plan: billing.subscriptionPlan,
      status: billing.subscriptionStatus,
    });
  } catch (err) {
    console.error('[Analytics] startup identify failed:', err);
  }
}

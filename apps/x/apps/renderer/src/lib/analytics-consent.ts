/**
 * Renderer analytics consent.
 *
 * The security page says PostHog is off until the user enables it.
 * posthog-js queues capture() calls made before init and flushes that queue
 * on init, so a hook that fires while consent is off would ship the moment
 * the user later opts in. Call sites drop the event unless this flag is on
 * and the client has actually been started.
 */

let enabled = false;
let ready = false;

/** Whether the user has turned product analytics on for this session. */
export function isRendererAnalyticsEnabled(): boolean {
  return enabled && ready;
}

/**
 * Records the consent bit before the client exists. Capture stays closed
 * until markRendererAnalyticsReady, so a gap between the two cannot flush
 * a queued event.
 */
export function setRendererAnalyticsEnabled(next: boolean): void {
  enabled = next;
  if (!next) ready = false;
}

/** Opens capture only after posthog.init has run for an enabled session. */
export function markRendererAnalyticsReady(next: boolean): void {
  ready = enabled && next;
}

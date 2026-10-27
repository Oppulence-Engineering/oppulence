import { z } from "zod";

/**
 * Privacy preferences that must be readable by the main process.
 *
 * The usage-data toggle previously lived in renderer `localStorage`, which the
 * main process cannot read — so the switch moved a value nobody consulted and
 * analytics ran regardless of what it said. A control that claims to govern
 * what leaves the machine has to be stored where the code doing the sending
 * can see it.
 */
export const PrivacyConfigSchema = z.object({
  /**
   * Send product analytics to PostHog.
   *
   * Defaults false. The public security page says analytics is fail-closed
   * until the user enables it. A missing privacy.json is not consent. A file
   * that already sets true stays on.
   */
  shareUsageData: z.boolean().default(false),
});

export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;

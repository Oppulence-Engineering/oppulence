import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";

import {
  isRendererAnalyticsEnabled,
  markRendererAnalyticsReady,
  setRendererAnalyticsEnabled,
} from "@/lib/analytics-consent";

let appVersion: string | undefined;
let apiUrl: string | undefined;
let started = false;

/**
 * The live client, or null when analytics is off.
 *
 * Null until both the stored preference is on and init has finished. That
 * ordering is what keeps posthog-js from flushing events captured earlier
 * in the session, including exception capture wired up by init itself.
 */
function client(): typeof posthog | null {
  if (!isRendererAnalyticsEnabled()) return null;
  return posthog;
}

type RendererAnalyticsStart = {
  installationId?: string;
  apiUrl?: string;
  appVersion?: string;
};

/**
 * Starts the renderer PostHog client. No-op without a key. Safe to call again
 * when the user turns the setting on after launch.
 */
export function startRendererAnalytics(props: RendererAnalyticsStart): void {
  // Store version context before init. Capture stays closed until ready is set
  // below, so this call only remembers the values.
  appVersion = props.appVersion?.trim() || undefined;
  apiUrl = props.apiUrl?.trim() || undefined;
  setRendererAnalyticsEnabled(true);
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) {
    markRendererAnalyticsReady(false);
    return;
  }
  if (!started) {
    // Call posthog.init directly. client() is still null here on purpose:
    // ready is false until init returns, so a queued pre-consent event cannot
    // flush through the gated helpers.
    posthog.init(key, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      defaults: "2025-11-30",
      capture_exceptions: true,
      autocapture: false,
      capture_pageview: false,
      ...(props.installationId ? { bootstrap: { distinctID: props.installationId } } : {}),
      before_send: (event: CaptureResult | null) => {
        if (!event || !isRendererAnalyticsEnabled()) return null;
        if (appVersion) {
          event.properties = { ...event.properties, app_version: appVersion };
        }
        return event;
      },
      loaded: () => {
        configureAnalyticsContext({ apiUrl, appVersion });
      },
    });
    started = true;
  }
  posthog.opt_in_capturing();
  markRendererAnalyticsReady(true);
  configureAnalyticsContext({ apiUrl, appVersion });
}

/** Stops capture immediately. The next event must not leave the machine. */
export function stopRendererAnalytics(): void {
  if (started) {
    posthog.opt_out_capturing();
  }
  setRendererAnalyticsEnabled(false);
}

export function setPersonProperties(props: Record<string, string | number | boolean>): void {
  client()?.people.set(props);
}

export function setPersonPropertiesOnce(props: Record<string, string | number | boolean>): void {
  client()?.people.set_once(props);
}

export function captureEvent(event: string, props?: Record<string, unknown>): void {
  client()?.capture(event, props);
}

function appVersionProperties(): Record<string, string> {
  return appVersion ? { app_version: appVersion } : {};
}

export function configureAnalyticsContext(props: { appVersion?: string; apiUrl?: string }) {
  appVersion = props.appVersion?.trim() || undefined;
  apiUrl = props.apiUrl?.trim() || undefined;

  const eventProperties = appVersionProperties();
  if (Object.keys(eventProperties).length > 0) {
    client()?.register(eventProperties);
  }

  const personProperties = {
    ...(apiUrl ? { api_url: apiUrl } : {}),
    ...eventProperties,
  };
  if (Object.keys(personProperties).length > 0) {
    client()?.people.set(personProperties);
  }
}

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  client()?.identify(userId, {
    ...properties,
    ...appVersionProperties(),
  });
}

export function resetAnalyticsIdentity() {
  client()?.reset();
  configureAnalyticsContext({ appVersion, apiUrl });
}

export function chatSessionCreated(runId: string) {
  client()?.capture("chat_session_created", { run_id: runId });
}

export function chatMessageSent(props: {
  voiceInput?: boolean;
  voiceOutput?: string;
  searchEnabled?: boolean;
  voiceInputProvider?: string;
}) {
  client()?.capture("chat_message_sent", {
    voice_input: props.voiceInput ?? false,
    voice_output: props.voiceOutput ?? false,
    search_enabled: props.searchEnabled ?? false,
    ...(props.voiceInputProvider ? { voice_input_provider: props.voiceInputProvider } : {}),
  });
}

export function oauthConnected(provider: string) {
  client()?.capture("oauth_connected", { provider });
}

export function oauthDisconnected(provider: string) {
  client()?.capture("oauth_disconnected", { provider });
}

export function voiceInputStarted() {
  client()?.capture("voice_input_started");
}

// ---- Transcription (RFC 009 §19) — durations/metadata only, never audio or text ----

export type TranscriptionMode = "voice" | "meeting";

export function transcriptionStarted(props: {
  provider: string;
  mode: TranscriptionMode;
  model?: string;
  /** `native` = dual-track sidecar capture, `renderer` = in-app WebAudio pipeline. */
  captureEngine?: string;
  /** False when the system track never opened, so a one-sided transcript is
   *  distinguishable from a quiet meeting in aggregate. */
  systemAudioCaptured?: boolean;
}) {
  client()?.capture("transcription_started", {
    provider: props.provider,
    mode: props.mode,
    ...(props.model ? { model: props.model } : {}),
    ...(props.captureEngine ? { capture_engine: props.captureEngine } : {}),
    ...(props.systemAudioCaptured !== undefined
      ? { system_audio_captured: props.systemAudioCaptured }
      : {}),
  });
}

export function transcriptionCompleted(props: {
  provider: string;
  mode: TranscriptionMode;
  model?: string;
  audioMs?: number;
  latencyMs?: number;
  rtf?: number;
  accel?: string;
  fallback?: boolean;
}) {
  client()?.capture("transcription_completed", {
    provider: props.provider,
    mode: props.mode,
    ...(props.model ? { model: props.model } : {}),
    ...(props.audioMs != null ? { audio_ms: Math.round(props.audioMs) } : {}),
    ...(props.latencyMs != null ? { latency_ms: Math.round(props.latencyMs) } : {}),
    ...(props.rtf != null ? { rtf: props.rtf } : {}),
    ...(props.accel ? { accel: props.accel } : {}),
    fallback: props.fallback ?? false,
  });
}

export function transcriptionFailed(props: {
  provider: string;
  mode: TranscriptionMode;
  code: string;
  captureEngine?: string;
}) {
  client()?.capture("transcription_failed", {
    provider: props.provider,
    mode: props.mode,
    code: props.code,
    ...(props.captureEngine ? { capture_engine: props.captureEngine } : {}),
  });
}

export function whisperModelDownloaded(props: {
  id: string;
  sizeMb?: number;
  durationMs?: number;
}) {
  client()?.capture("whisper_model_downloaded", {
    id: props.id,
    ...(props.sizeMb != null ? { size_mb: props.sizeMb } : {}),
    ...(props.durationMs != null ? { duration_ms: Math.round(props.durationMs) } : {}),
  });
}

export function transcriptionProviderChanged(props: {
  feature: TranscriptionMode;
  from: string;
  to: string;
  reason: "user" | "quota" | "capability" | "remote" | "fallback";
}) {
  client()?.capture("transcription_provider_changed", props);
  // Person property: the user's preferred engine for the voice feature.
  if (props.feature === "voice") {
    client()?.people.set({ transcription_engine_pref: props.to });
  }
}

export function searchExecuted(types: string[]) {
  client()?.capture("search_executed", { types });
}

export function noteExported(format: string) {
  client()?.capture("note_exported", { format });
}

export function feedbackSubmitted(category: string) {
  client()?.capture("feedback_submitted", { category });
}

export type ProductTourVariant = "main" | "relationships" | "meetings" | "actions";

export function productTourStarted(variant: ProductTourVariant) {
  client()?.capture("product_tour_started", { variant });
}

export function productTourStepViewed(variant: ProductTourVariant, step: number, target: string) {
  client()?.capture("product_tour_step_viewed", { variant, step: step + 1, target });
}

export function productTourSkipped(variant: ProductTourVariant, step: number) {
  client()?.capture("product_tour_skipped", { variant, step: step + 1 });
}

export function productTourDismissed(variant: ProductTourVariant, step: number) {
  client()?.capture("product_tour_dismissed", { variant, step: step + 1 });
}

export function productTourAbandoned(variant: ProductTourVariant, step: number) {
  client()?.capture("product_tour_abandoned", { variant, step: step + 1 });
}

export function productTourCompleted(variant: ProductTourVariant, stepCount: number) {
  client()?.capture("product_tour_completed", { variant, step_count: stepCount });
}

export function productTourTargetMissing(
  variant: ProductTourVariant,
  step: number,
  target: string,
) {
  client()?.capture("product_tour_target_missing", { variant, step: step + 1, target });
}

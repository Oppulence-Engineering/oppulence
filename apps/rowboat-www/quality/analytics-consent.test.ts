// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getConsolePreferences: vi.fn(),
  init: vi.fn(),
  optIn: vi.fn(),
  optOut: vi.fn(),
}));

vi.mock("@/lib/console/console", () => ({
  getConsolePreferences: mocks.getConsolePreferences,
}));
vi.mock("posthog-js", () => ({
  default: {
    capture: mocks.capture,
    init: mocks.init,
    opt_in_capturing: mocks.optIn,
    opt_out_capturing: mocks.optOut,
  },
}));

describe("analytics consent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph_test";
    delete (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  });

  it("does not initialize or capture without synced consent", async () => {
    mocks.getConsolePreferences.mockResolvedValue({
      defaultAgentSlug: "",
      displayName: "",
      shareUsageData: false,
    });
    const { capture } = await import("@/lib/analytics/analytics");

    capture("viewed", { surface: "report" });
    await vi.waitFor(() => {
      expect(mocks.getConsolePreferences).toHaveBeenCalledOnce();
    });

    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("drops sensitive and structured properties before capture", async () => {
    mocks.getConsolePreferences.mockResolvedValue({
      defaultAgentSlug: "",
      displayName: "",
      shareUsageData: true,
    });
    const { capture } = await import("@/lib/analytics/analytics");

    capture("exported", {
      commitmentId: "secret-id",
      message: "customer content",
      surface: "report",
      count: 2,
      nested: { unsafe: true },
    });
    await vi.waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledOnce();
    });

    expect(mocks.capture).toHaveBeenCalledWith("exported", {
      surface: "report",
      count: 2,
    });
  });

  it("treats Global Privacy Control as an analytics opt-out", async () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    mocks.getConsolePreferences.mockResolvedValue({
      defaultAgentSlug: "",
      displayName: "",
      shareUsageData: true,
    });
    const { capture, setAnalyticsConsent } = await import("@/lib/analytics/analytics");

    capture("viewed", { surface: "report" });
    setAnalyticsConsent(true);
    await Promise.resolve();

    expect(mocks.getConsolePreferences).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.optIn).not.toHaveBeenCalled();
  });
});

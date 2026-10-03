// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => ({
  capture: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock("@/lib/analytics/analytics", () => ({
  capture: billing.capture,
  RevenueEvents: { UpgradeClicked: "revenue_upgrade_clicked" },
}));
vi.mock("@/lib/revenue/revenue", () => ({
  startCheckout: billing.startCheckout,
}));

import {
  checkoutFailureCopy,
  PlanSection,
  usageMeterLabel,
  usageMeterValue,
} from "@/components/features/settings/app-settings/app-settings";

const session = (plan: string) => ({
  billing: { plan, status: "active", usage: {} },
  user: { permissions: [] },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("settings billing upgrade", () => {
  it("offers checkout outside the recovery flow and recovers from a transient failure", async () => {
    const user = userEvent.setup();
    billing.startCheckout.mockRejectedValue(new Error("checkout unavailable"));
    render(<PlanSection session={session("free")} />);

    const upgrade = screen.getByRole("button", { name: /upgrade to pro/i });
    await user.click(upgrade);

    expect(billing.startCheckout).toHaveBeenCalledWith("pro");
    expect(billing.capture).toHaveBeenCalledWith("revenue_upgrade_clicked", {
      from: "settings",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Checkout is temporarily unavailable",
    );
    expect(upgrade).toBeEnabled();
  });

  it("says when checkout is not configured instead of asking for a retry", async () => {
    const user = userEvent.setup();
    billing.startCheckout.mockRejectedValue(
      Object.assign(new Error("Stripe checkout is not configured"), {
        code: "provider_unconfigured",
        status: 502,
      }),
    );
    render(<PlanSection session={session("free")} />);

    await user.click(screen.getByRole("button", { name: /upgrade to pro/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Checkout isn't configured on the server yet.",
    );
    expect(screen.queryByText(/please try again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument();
    expect(checkoutFailureCopy(new Error("checkout unavailable"))).toBe(
      "Checkout is temporarily unavailable. Please try again.",
    );
  });

  it("names credit meters instead of API field names", () => {
    expect(usageMeterLabel("sanctionedCredits")).toBe("Included credits");
    expect(usageMeterLabel("usedCredits")).toBe("Credits used");
    expect(usageMeterLabel("availableCredits")).toBe("Credits remaining");
    expect(usageMeterLabel("usageDay")).toBe("Usage day");
    expect(usageMeterValue("sanctionedCredits", 10000)).toBe("10,000");
    expect(usageMeterValue("usedCredits", 0)).toBe("0");
    expect(usageMeterValue("usageDay", 20260930)).toBe("20260930");
    render(
      <PlanSection
        session={{
          billing: {
            plan: "free",
            status: "active",
            usage: { sanctionedCredits: 10000, usedCredits: 0, availableCredits: 10000 },
          },
          user: { permissions: [] },
        }}
      />,
    );
    const included = screen.getByText("Included credits");
    expect(included).toBeVisible();
    expect(included).not.toHaveClass("capitalize");
    expect(screen.getByText("Credits used")).not.toHaveClass("capitalize");
    expect(screen.getByText("Credits remaining")).not.toHaveClass("capitalize");
    expect(screen.getByText("Free")).toBeVisible();
    expect(screen.getAllByText("10,000").length).toBeGreaterThan(0);
    expect(screen.queryByText("10000")).not.toBeInTheDocument();
    expect(screen.queryByText("sanctionedCredits")).not.toBeInTheDocument();
    expect(screen.queryByText("SanctionedCredits")).not.toBeInTheDocument();
  });

  it("does not upsell a workspace that is already on Pro", () => {
    render(<PlanSection session={session("pro")} />);
    expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
  });
});

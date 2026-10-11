// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Slider } from "@oppulence/ui/components/slider";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

describe("Slider", () => {
  it("puts the accessible name on the thumb", () => {
    render(<Slider aria-label="How many to show" max={1} min={0.25} value={[0.72]} />);

    expect(screen.getByRole("slider", { name: "How many to show" })).toHaveAttribute(
      "aria-valuenow",
      "0.72",
    );
  });
});

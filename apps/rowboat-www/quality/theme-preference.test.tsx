// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThemePreference } from "@/components/features/dashboard/app-shell/app-shell";

function ThemeProbe() {
  const { setTheme } = useThemePreference();
  return (
    <button onClick={() => setTheme("dark")} type="button">
      Use dark
    </button>
  );
}

describe("useThemePreference", () => {
  beforeEach(() => {
    document.documentElement.className = "font-sans light";
    window.localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    document.documentElement.className = "";
    vi.unstubAllGlobals();
  });

  it("lets next-themes replace light with dark instead of keeping both classes", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Use dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});

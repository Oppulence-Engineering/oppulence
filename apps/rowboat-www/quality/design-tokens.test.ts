import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Shared design tokens for the desktop app, the web app, and the landing page.
const TOKENS = path.resolve(import.meta.dirname, "../../../packages/ui/src/styles/tokens.css");

const BACKGROUNDS = ["--background", "--surface", "--muted", "--accent"];
// WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for control outlines and focus (1.4.11).
const TEXT = [
  "--foreground",
  "--muted-foreground",
  "--subtle-foreground",
  "--destructive",
  "--success",
  "--warning",
];
const CONTROLS = ["--input", "--ring"];
const TEXT_ON_FILL = [
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--destructive-foreground", "--destructive"],
  ["--success-foreground", "--success"],
  ["--warning-foreground", "--warning"],
];

/** Collect `--name: value;` from top-level blocks that open with `selector {`. */
function readBlocks(css: string, selector: ":root" | ".dark"): Record<string, string> {
  const declarations: Record<string, string> = {};
  const blocks = css.matchAll(new RegExp(`^${selector.replace(".", "\\.")} \\{([^}]*)\\}`, "gm"));
  for (const [, body] of blocks) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[name] = value.trim();
    }
  }
  return declarations;
}

function resolve(tokens: Record<string, string>, name: string): string {
  if (!Object.hasOwn(tokens, name)) throw new Error(`${name} is not defined`);
  const value = tokens[name];
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolve(tokens, reference[1]) : value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const css = readFileSync(TOKENS, "utf8");
const light = readBlocks(css, ":root");
const modes = { light, dark: { ...light, ...readBlocks(css, ".dark") } };

describe("design token contrast (WCAG 2.2 AA)", () => {
  it.each(Object.entries(modes))("%s mode meets the minimum ratios", (_mode, tokens) => {
    const pairs = [
      ...TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg, 4.5] as const)),
      ...CONTROLS.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg, 3] as const)),
      ...TEXT_ON_FILL.map(([fg, bg]) => [fg, bg, 4.5] as const),
    ];
    const failures = pairs
      .map(([fg, bg, minimum]) => ({
        fg,
        bg,
        minimum,
        ratio: contrast(resolve(tokens, fg), resolve(tokens, bg)),
      }))
      .filter(({ ratio, minimum }) => ratio < minimum)
      .map(
        ({ fg, bg, ratio, minimum }) =>
          `${fg} on ${bg}: ${ratio.toFixed(2)}:1 < ${String(minimum)}:1`,
      );

    expect(failures).toEqual([]);
  });

  it("uses hex values for every checked color", () => {
    const names = [...BACKGROUNDS, ...TEXT, ...CONTROLS, ...TEXT_ON_FILL.flat()];
    for (const tokens of Object.values(modes)) {
      for (const name of names) expect(resolve(tokens, name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

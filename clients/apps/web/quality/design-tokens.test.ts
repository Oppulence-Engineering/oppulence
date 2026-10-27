import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Shared design tokens (Polar base) for the desktop app, the web app, and the landing page.
const STYLES = path.resolve(import.meta.dirname, "../../../packages/ui/src/styles");

const BACKGROUNDS = ["--background", "--surface", "--surface-raised", "--muted", "--accent"];
// WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for control outlines and focus (1.4.11).
const TEXT = ["--foreground", "--muted-foreground", "--destructive", "--success", "--warning"];
// Tertiary text sits on the page and on surfaces, not on muted fills.
const TERTIARY_TEXT = ["--subtle-foreground"];
const PAGE_BACKGROUNDS = ["--background", "--surface", "--surface-raised"];
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
function readBlocks(css: string, selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [, body] of css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, "gm"))) {
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

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Linear sRGB channels for a hex, hsl(), or oklch() color. */
function linearRgb(color: string): number[] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) return [0, 2, 4].map((i) => toLinear(Number.parseInt(hex[1].slice(i, i + 2), 16) / 255));
  const hsl = /^hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\s*\)$/.exec(color);
  if (hsl) {
    const [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => toLinear(l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  }
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(color);
  if (oklch) {
    const [L, C, H] = [Number(oklch[1]), Number(oklch[2]), (Number(oklch[3]) * Math.PI) / 180];
    const [a, b] = [C * Math.cos(H), C * Math.sin(H)];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((channel) => Math.min(1, Math.max(0, channel)));
  }
  throw new Error(`Unsupported color ${color}`);
}

function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, bl] = linearRgb(color);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const tokensCss = readFileSync(path.join(STYLES, "tokens.css"), "utf8");
const polarCss = readFileSync(path.join(STYLES, "polar.css"), "utf8");
const light = { ...readBlocks(polarCss, "@theme static"), ...readBlocks(tokensCss, ":root") };
const modes = { light, dark: { ...light, ...readBlocks(tokensCss, ".dark") } };

describe("design token contrast (WCAG 2.2 AA)", () => {
  it.each(Object.entries(modes))("%s mode meets the minimum ratios", (_mode, tokens) => {
    const pairs = [
      ...TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg, 4.5] as const)),
      ...TERTIARY_TEXT.flatMap((fg) => PAGE_BACKGROUNDS.map((bg) => [fg, bg, 4.5] as const)),
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

  it("builds on the Polar color scales", () => {
    expect(tokensCss).toContain('@import "./polar.css";');
    expect(resolve(light, "--background")).toBe(resolve(light, "--color-gray-50"));
    expect(resolve(modes.dark, "--background")).toBe(resolve(light, "--color-polar-800"));
  });
});

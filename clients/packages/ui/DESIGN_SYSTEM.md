# Oppulence design system

One visual system for the desktop app (`clients/apps/desktop`), the web app
(`clients/apps/web/app/(product)`), and the public site
(`clients/apps/web/app/(marketing)`, `(auth)`, `(legal)`). All three read the
same tokens, fonts, and icons from this package.

## Files

| File                            | Contents                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/styles/polar.css`          | Color scales, shadows, and the radius scale from Polar (polar.sh, Apache-2.0, commit `b116f66b`). Do not edit. |
| `src/styles/tokens.css`         | Semantic tokens for light and dark, density, motion, and the Tailwind `@theme inline` map.                     |
| `src/styles/product-system.css` | Product shell rules: compact type, icons, and the radius placeholder.                                          |
| `src/styles/product-theme.css`  | Shared product chrome, such as the logo lockup and the settings workspace.                                     |
| `src/lib/icons.tsx`             | The Phosphor icon wrapper. Each app also has its own `lib/icons.tsx`.                                          |

`THIRD_PARTY_NOTICES` at the repository root holds the Polar attribution.

## Tokens

Use the semantic tokens. Do not use the Polar scales directly in app code.

| Token                                     | Tailwind class                      | Use                                                         |
| ----------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `--background`                            | `bg-background`                     | The page.                                                   |
| `--card`, `--surface`                     | `bg-card`                           | Cards and panels on the page.                               |
| `--muted`, `--accent`                     | `bg-muted`, `bg-accent`             | Quiet fills and hover surfaces.                             |
| `--foreground`                            | `text-foreground`                   | Body text and strong text.                                  |
| `--muted-foreground`                      | `text-muted-foreground`             | Secondary text.                                             |
| `--subtle-foreground`                     | `text-subtle-foreground`            | Tertiary text, on page backgrounds only.                    |
| `--primary`                               | `bg-primary`, `text-primary`        | The blue action color. It is not a text color for headings. |
| `--border`                                | `border-border`                     | Dividers and card edges.                                    |
| `--input`                                 | `border-input`                      | Control edges. It meets 3:1 against the page.               |
| `--ring`                                  | `ring-ring`                         | Focus rings.                                                |
| `--destructive`, `--success`, `--warning` | `text-destructive`, `bg-success`, … | Status colors.                                              |

Dark mode comes from the `.dark` class on `<html>`. Do not use
`prefers-color-scheme` in app CSS. next-themes (web) and the desktop theme
setting both set the class.

## Radius

The base radius is `--radius: 0.6rem` (Polar). Use the scale:

| Class          | Size             | Use                                             |
| -------------- | ---------------- | ----------------------------------------------- |
| `rounded-xs`   | 2px              | Chart keys and tooltip arrows.                  |
| `rounded-sm`   | `--radius` − 4px | Menu rows, checkboxes, and keyboard keys.       |
| `rounded-md`   | `--radius` − 2px | Buttons, inputs, menus, popovers, and tooltips. |
| `rounded-lg`   | `--radius`       | Cards, dialogs, and alerts.                     |
| `rounded-full` |                  | Avatars, dots, and pills.                       |

Older app code uses `rounded-none` as a placeholder. Inside a product shell,
`product-system.css` gives the placeholder the shared radius. Use the scale
above in new code.

## Type

1. Use Inter for text (`font-sans`, `var(--typeface-sans)`).
2. Use Geist Mono for code and data (`font-mono`, `var(--typeface-mono)`).
3. Do not add a font. Do not use a raw font stack in CSS or class strings.

The web app loads both fonts with `next/font` in `clients/apps/web/lib/fonts.ts`.
The desktop app loads them with `@fontsource-variable`.

## Icons

1. Import UI icons from the app's `@/lib/icons`. The wrapper uses Phosphor.
2. Add a missing icon to the wrapper. Do not import `@phosphor-icons/react`,
   `lucide-react`, or `@sim/emcn/icons` in feature code.
3. Brand logos (Google, GitHub, Slack, and similar) are the only exception.
   Phosphor has no brand logos.

## Accessibility

1. Text and controls meet WCAG 2.2 AA. `clients/apps/web/quality/design-tokens.test.ts`
   checks every token pair.
2. Every interactive element shows a focus ring with `--ring`.
3. Motion tokens go to 0ms under `prefers-reduced-motion`.
4. Hit targets are at least 24 × 24 px.

## Guardrails

| Check                                         | What it rejects                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `quality/design-tokens.test.ts` (web)         | Token pairs below AA contrast.                                                                                                          |
| `WEB030` `oppulence-web/no-raw-design-values` | Raw colors, radii, and fonts in class strings (web).                                                                                    |
| `X021` `x-architecture/no-raw-design-values`  | The same, in the desktop renderer. The baseline is in `clients/apps/desktop/config/baselines/architecture.json`.                                      |
| `WEB031` `quality/css-design-values.test.ts`  | New raw colors or font stacks in CSS, in both apps and this package. The exact counts are in `quality/css-design-values-baseline.json`. |

## Change a token

1. Edit `src/styles/tokens.css`.
2. Run `npx vitest run quality/design-tokens.test.ts` in `clients/apps/web`.
3. Run `pnpm install` in `clients/apps/desktop`. The desktop app uses a copy of this package.
4. Check both apps in light and dark mode.

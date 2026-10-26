# Oppulence Design Language (desktop)

The desktop app, the web app, and the public site share one visual system: the same tokens, fonts, radius, and icons. The shared rules are in [`packages/ui/DESIGN_SYSTEM.md`](../../../../packages/ui/DESIGN_SYSTEM.md). This file covers the desktop principles only.

Oppulence should feel like an ElevenLabs-style developer console for people who live in notes, agents, email, meetings, and files all day. The launch direction is quiet, fast, and prosumer: dense enough for repeated work, neutral enough for repeated use, and explicit about what the AI is doing.

## Principles

1. **Calm density**
   Keep the interface compact and scannable. Use tighter rows, restrained borders, and low-contrast panels so users can keep many contexts open without the app feeling heavy.

2. **Command first**
   Primary actions should feel like instant commands, not marketing CTAs. Side navigation, search, model selection, and composer controls use compact Phosphor icon-led affordances with clear hover and selected states.

3. **Visible work state**
   AI actions, sync, saving, meeting capture, and background tasks need clear status surfaces. Prefer small persistent indicators over large banners.

4. **Notes as the canvas**
   The editor and conversation stay visually dominant. Chrome is supportive, not decorative. Avoid nested cards and oversized empty states in work surfaces.

5. **Neutral precision**
   The palette is the shared token set in `@oppulence/ui` (built on Polar's color scales): light gray and graphite surfaces, a blue primary action, neutral command tools, and reserved semantic colors for destructive and chart states.

## Tokens

- Radius: the shared Polar scale (`--radius: 0.6rem`). Use `rounded-sm`, `rounded-md`, and `rounded-lg`, as `packages/ui/DESIGN_SYSTEM.md` describes. Older code uses `rounded-none` as a placeholder; inside the shell it takes the shared radius.
- Backgrounds: light gray surfaces in light mode; graphite (Polar dark scale) surfaces in dark mode.
- Borders: one step darker than surfaces, quiet enough to separate panels without tinting them.
- Shadows: reserved for the composer, menus, dialogs, and active segmented controls.
- Type: Inter for text and Geist Mono for code and data. Do not add a font.
- Accent use: blue is the primary action color. Extra hues are reserved for semantic states and charts.
- Icons: app UI icons come from **Phosphor** (`@phosphor-icons/react`). Import them from `@/lib/icons`, which adds the `app-icon` class and the size defaults. **Providers and integrations use their authentic logomark** — a monochrome, single-path SVG filled with `currentColor` (official Simple Icons glyphs in `components/onboarding/provider-icons.tsx`), never a whimsical stand-in.
- Guardrail: `x-architecture/no-raw-design-values` (X021) rejects raw colors, radii, and font stacks in class strings.

## Core Surfaces

- **Sidebar:** persistent workflow switcher with calm selected states. Quick-action icons use neutral ink from the dev palette.
- **Titlebar/tabs:** slim, scan-first navigation. Active tabs get a bottom signal line, not a bulky filled pill.
- **Composer:** the highest-emphasis control outside the active canvas. It is slightly raised, flat, bordered by the primary tone, and sharp enough to feel like an input terminal.
- **Messages:** user messages are compact structured blocks; assistant messages remain full-width and readable.
- **Status:** sync, saving, recording, and task activity stay small but always visible near the surface they affect.

## Launch Positioning

The visual story is: **Oppulence is the personal AI workspace for people whose work already spans meetings, mail, notes, browser tasks, and agents.** It should feel closer to a focused desktop tool than a chat website.

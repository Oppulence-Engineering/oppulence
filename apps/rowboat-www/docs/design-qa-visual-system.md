**Source Visual Truth**

- Visual basis: Polar (polar.sh) `clients/apps/web/src/styles/globals.css` at polarsource/polar `b116f66b`. The color scales, shadows, and radius scale are vendored in `packages/ui/src/styles/polar.css` (Apache-2.0, see `THIRD_PARTY_NOTICES`).
- Shared rules: `packages/ui/DESIGN_SYSTEM.md`.
- Surfaces under test: the desktop app (`apps/x`), the web app (`apps/rowboat-www/app/(product)`), and the public site (`app/(marketing)`, `(auth)`, `(legal)`).

**Implementation Evidence**

- Desktop screenshots: isolated Electron launch (temp profile and temp workdir, no real user data), 1280 x 800, light and dark:
  - Before (Phase 2, square): `scratchpad/shots/after-polar-desktop/desktop-{home,settings,dialog,note-editor,chat-composer,onboarding}-{light,dark}.png`
  - After (Phase 5): `scratchpad/shots/after-seams-desktop/…` (same names)
- Web and public-site screenshots: production build with the e2e fake API, 1440 x 960 and 390 x 844, light and dark:
  - Before: `scratchpad/shots/after-polar/{landing,web}-*.png`
  - After: `scratchpad/shots/after-seams/{landing,web}-*.png`
- Public-site Phase 4 pairs (10 routes, light and dark): `scratchpad/shots/p4/pair-*.png`
- Side-by-side, desktop versus web (home, settings, command dialog; light and dark): `scratchpad/shots/p5/desktop-vs-web.png`
- Before/after sheets: `scratchpad/shots/p5/{desktop,web}-{home,settings,dialog}-{light,dark}-before-after.png` and `sign-in-{light,dark}-before-after.png`
- `scratchpad` is `/private/tmp/claude-501/-Users-dyomba--warp-worktrees-Desktop-Assistant-iron-hawk/0acbfadc-b380-43b6-be4c-5bfc09d0dc82/scratchpad`.
- Computed-style proof for the Phase 4 CSS refactor (dead rules and split): 25 routes x 2 viewports x 2 color schemes, 31,196 elements, no difference except one lazy-image placeholder.
- State: signed-out desktop shell with one seeded note; signed-in web shell against the fake API (some views show load errors, because the fake API lacks those routes).

**Findings**

- No P0 or P1 differences remain between the surfaces.
- Colors and visual tokens: all three surfaces read the shared tokens. The public site no longer stacks 4 palettes. Strong text uses `text-foreground`; `primary` is the blue action color.
- Radius: both apps use the 0.6rem Polar radius. The desktop square-everything rule is gone. Images and avatars stay square.
- Fonts and typography: Inter and Geist Mono only. DM Mono, Geist Sans, F37 Stout, and the Roboto import are gone.
- Icons: Phosphor through `lib/icons` on every surface. No source imports `@sim/emcn/icons`. Brand logos and Sim workflow block glyphs are the only exceptions.
- Interaction states: the sign-in button is the shared outline button (border, dark fill, focus ring). Focus outlines on the public site use `--ring`.
- Contrast: every token pair meets WCAG 2.2 AA (`quality/design-tokens.test.ts`).
- P2 — dark-mode borders are faint. Polar's dark border (polar-700 on polar-800) is about 1.2:1. It is decorative, but chips and frames on `/download` read weaker than before.
- P2 — layout and content differ, outside this visual-only scope: the logo lockup sits top right on the desktop ("Oppulence" + orange "AI" badge) and top left on the web (mark + version chip); the desktop settings page has a search field and a larger title; the desktop command dialog is a compact search, the web dialog is a command list.
- Console errors: not checked in this pass.

**Open Questions**

- Should the desktop and web headers share one lockup (mark, wordmark, and badge in one position)? That is a layout change.
- Should dark mode use Polar's darker page (polar-950) to make borders read stronger? That changes the Phase 2 token map.

**Comparison History**

- Phase 2 (#753): both apps load `@oppulence/ui/tokens.css` on the Polar scales. Strong text moved from `text-primary` to `text-foreground` (816 class names).
- Phase 4 (#755): the public site dropped 4 stacked palettes, 1,023 dead rules, 3 fonts, and the emcn icons. `marketing-styles.css`: 244,452 bytes before, 99,703 bytes after (index plus 6 section files). Raw color literals in the marketing CSS: 628 before, 133 after.
- Phase 5, iteration 1 — P1: the radius placeholder rounded the 24px workspace logo and initials tiles into circles.
  - Fix: the placeholder rule skips `img` and `[data-slot^="avatar"]`.
  - Post-fix evidence: `scratchpad/shots/p5/web-logo-check.png`.

**Implementation Checklist**

- [x] Tokens, fonts, and icons come from `packages/ui` (Polar base, Inter and Geist Mono, Phosphor).
- [x] One radius scale (0.6rem) in both apps and the public site.
- [x] Dark mode follows the `.dark` class on every surface.
- [x] Class-string lint: zero raw values on the web (WEB030); one allowed brand color on the desktop (X021, Discord).
- [x] CSS raw values cannot grow (WEB031 ratchet: 537 values in 20 files).
- [x] WCAG 2.2 AA token contrast, focus ring on `--ring`, reduced-motion tokens.
- [x] Before and after screenshots, plus a desktop-versus-web side-by-side image.
- [x] Shared design doc linked from the desktop `DESIGN_LANGUAGE.md` and the rowboat-www `AGENTS.md`.

**Follow-up Polish**

- Replace the 580 `rounded-none` placeholders in app code with `rounded-lg`, then delete the placeholder block in `product-system.css`.
- Lower the WEB031 baseline: map the remaining 537 raw CSS values (largest: desktop `App.css` 122, marketing `site.css` 113).
- Decide the two open questions above.

final result: passed with P2 follow-ups

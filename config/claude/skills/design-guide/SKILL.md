---
name: design-guide
description: >
  The house design guide — 16 chapters distilled from 16 books on design, web design, typography,
  colour, interaction, accessibility, data visualization and UX, extended with modern practice.
  Load it BEFORE writing any user-facing interface: a page, screen, component, form, table, chart,
  dashboard, email, landing page, CLI-adjacent web UI, or a CSS/Tailwind/design-token change.
  Triggers on: build/style/redesign a UI, "make this look better", pick colours or fonts, set
  spacing, choose a layout or grid, dark mode, design tokens, responsive/breakpoints, modal vs
  drawer, form validation, empty/loading/error states, animation timing, microcopy and button
  labels, accessibility/WCAG/contrast/ARIA/focus/tap targets, chart type selection, dashboard
  layout, usability review, dark patterns, or any request to critique or audit an interface.
  Also use when the user says /design-guide, "check the design guide", or "what does the guide say".
version: 1.0.0
---

# Design Guide

The full guide lives at **`/home/jofre/projects/design/guide/`**. This file is the hot core: the
defaults that answer most questions without opening anything. Open a chapter when the decision is
consequential, contested, or not covered below.

> Everything here is a **default**, not a law — except the Non-negotiables, which are close to
> laws. Follow the defaults when you have no better idea; break them deliberately when you do,
> and make the break look intentional. Consistency everywhere else is what earns the exception.

## Use it like this

1. **Before building** — read the routing table, open the 1–2 chapters that own the decision.
2. **While building** — apply the token defaults below rather than inventing values.
3. **Before shipping** — run `15-checklists.md`, then `16-antipatterns.md` as a paranoia pass.

Do not paste the whole guide into context. Open the chapter you need; each one is self-contained
and states what it leaves to its siblings.

## Routing table

| Question | Chapter |
|---|---|
| Why do users fail this? Affordances, feedback, cognitive load, Gestalt, error taxonomy | `01-foundations.md` |
| What do I build first? Does this need UI at all? Cold-start checklist | `02-process.md` |
| Where does it go, how big, how much space, breakpoints, containers | `03-layout-and-grid.md` |
| Font choice, sizes, line-height, measure, tracking, microtypography | `04-typography.md` |
| Palettes, ramps, semantic colour, dark mode, contrast, colour blindness | `05-color.md` |
| Making it look designed: hierarchy, emphasis, elevation, icons, imagery, polish | `06-hierarchy-and-visual-craft.md` |
| Navigation, search, lists, tables, forms, modals, menus, onboarding, touch, AI surfaces | `07-interaction-patterns.md` |
| Component states, loading, validation, errors, undo, toasts, motion | `08-states-feedback-motion.md` |
| Every user-visible string: labels, buttons, errors, empty states, voice, i18n | `09-content-and-voice.md` |
| WCAG thresholds, semantics, ARIA, keyboard, focus, alt text, testing | `10-accessibility.md` |
| Persuasion, defaults, trust, dark patterns, consent, AI disclosure | `11-psychology-and-ethics.md` |
| Chart choice, encoding, axes, tables, dashboards, accessible charts | `12-data-visualization.md` |
| Does it work? Usability testing, analytics, A/B, agent self-review | `13-research-and-testing.md` |
| Tokens, CSS architecture, layout primitives, component APIs, fonts, images, Core Web Vitals | `14-implementation.md` |
| Pre-ship checks | `15-checklists.md` |
| What not to do | `16-antipatterns.md` |
| Whole default system on one screen | `quick-reference.md` |
| What each source book is and isn't good for | `sources.md` |

Read `00-index.md` when unsure.

## The non-negotiables (all chapters)

1. **Hierarchy before style.** Decide primary / secondary / tertiary before touching a single
   property. Most bad UI is everything competing at once. De-emphasise before you emphasise.
2. **Space communicates grouping.** Space between groups must exceed space within them. Proximity
   is the strongest grouping signal there is — stronger than borders, boxes or colour.
3. **Pick from a scale, never from a picker.** Spacing, size, radius, shadow and colour all come
   from a small pre-defined set. Nudging a value by 1px means the scale is wrong, not the element.
4. **Contrast: 4.5:1** for body text, **3:1** for large text (≥24px, or ≥18.66px bold) and for UI
   component boundaries and icons. Check every state, including hover, disabled and placeholder.
5. **Never colour alone.** Every colour cue is paired with text, icon, shape or position.
6. **Keyboard parity.** Everything doable with a mouse is doable with a keyboard, in visual order,
   with no traps. Focus is always visible — `:focus-visible`, never `outline: none` bare.
7. **Targets ≥24×24 CSS px**, design to 44×44 for thumbs.
8. **Real semantics.** `<button>`, `<a href>`, `<label>`, `<table>` — never a `div` with an
   `onclick`. ARIA is a repair mechanism, not a feature.
9. **Every action gets a response** within 100ms, and every screen has designed empty, loading,
   error and no-results states. A screen without them is unfinished.
10. **Prefer undo to confirmation.** Confirm only what is irreversible and consequential. Never
    make the user start over; preserve their input.
11. **Words are the interface.** Cut half of them. Buttons say the verb (`Delete project`, not
    `OK`). Error messages say what happened, why, and what to do next — never blame the user.
12. **Respect `prefers-reduced-motion`**, and never disable pinch-zoom.
13. **Data encoding is proportional to the data.** No truncated axes presented as fair, no area
    or 3D encoding of one-dimensional quantities.
14. **The reverse action is as easy as the forward one.** If cancelling is harder than
    subscribing, it is a dark pattern regardless of intent.

## Default system (copy these values)

```css
/* Space — non-linear, 16px base. Skip steps as sizes grow. */
--space-1:.125rem  --space-2:.25rem  --space-3:.5rem   --space-4:.75rem
--space-5:1rem     --space-6:1.5rem  --space-7:2rem    --space-8:3rem
--space-9:4rem     --space-10:6rem   --space-11:8rem   --space-12:10rem
/* icon↔label 4–8 · label↔input 4–8 · between fields 24 · between groups 32 · sections 64 */

/* Type — hand-tuned, not a pure geometric ratio */
--size-1:.75rem  --size-2:.8125rem --size-3:.875rem --size-4:1rem   --size-5:1.125rem
--size-6:1.25rem --size-7:1.5rem   --size-8:1.875rem --size-9:2.25rem --size-10:3rem
--leading-tight:1.15 --leading-snug:1.35 --leading-normal:1.5 --leading-loose:1.7
--weight-regular:400 --weight-medium:500 --weight-semibold:600
--measure:65ch  --measure-prose:60ch   /* 45–75 chars; 1ch ≈ 1.1–1.2 chars in a UI sans */

/* Radius — one family, never mix square and round */
--radius-sm:6px --radius-md:10px --radius-lg:16px --radius-pill:9999px

/* Elevation — ambient + direct, light from above. Four raised levels
   (--elev-1…--elev-4) above flat --elev-0; --shadow-N only defines them. */
--shadow-1: 0 1px 2px rgb(16 24 40/.06), 0 1px 3px rgb(16 24 40/.10);
--shadow-2: 0 2px 4px rgb(16 24 40/.05), 0 4px 8px rgb(16 24 40/.08);
--shadow-3: 0 4px 6px rgb(16 24 40/.04), 0 12px 20px rgb(16 24 40/.10);
--shadow-4: 0 8px 10px rgb(16 24 40/.03), 0 24px 48px rgb(16 24 40/.16);

/* Motion — exits faster than entrances */
--dur-1:100ms --dur-2:150ms --dur-3:200ms --dur-4:250ms --dur-5:300ms --dur-max:500ms
--ease-enter:cubic-bezier(0,0,.2,1)  --ease-exit:cubic-bezier(.4,0,1,1)
--ease-move:cubic-bezier(.4,0,.2,1)

/* Layout */
--w-form:40rem --w-page:75rem --w-wide:90rem
--target-floor:24px    /* WCAG 2.2 SC 2.5.8 hard floor */
--target-min:2.75rem   /* 44px — working default for anything touched */

/* Focus — opaque two-tone ring. Never an alpha ring: it composites to ~1.4:1. */
--ring-focus: 0 0 0 2px var(--surface-page), 0 0 0 4px var(--focus);
:focus-visible { outline:none; box-shadow: var(--ring-focus); }
/* breakpoints sm 36rem · md 48rem · lg 64rem · xl 80rem — content-driven, not device-driven */
```

**Colour:** build ramps in **OKLCH**, not HSL (HSL lies about lightness). One grey ramp of 10–13
steps does most of the work; one action colour; a semantic set (danger / warning / success /
info) that are *roles*, not hues. Components consume semantic tokens
(`--surface-*`, `--text-*`, `--border-*`, `--color-action-*`) and never raw hues. Dark mode is a
second semantic mapping, never an inversion: express elevation with lighter surfaces rather than
darker shadows, and lighten + desaturate brand colours. Full ramps in `05-color.md` and
`14-implementation.md`.

## Fast heuristics

- **Feedback timing:** <100ms feels instant (no indicator) · 100ms–1s show state change ·
  1–10s determinate progress · >10s let them leave and notify.
- **Skeleton vs spinner:** nothing at all under 300ms; skeleton when the layout is known
  (300ms–2s); spinner only for indeterminate waits over 1s.
- **Dwell times:** toast 4s short / 8s long / 10s minimum when it carries an Undo. Tooltip opens
  after 500ms on hover, instantly on focus.
- **Density:** table rows 32px compact / 48px comfortable / 56px spacious. Fields 24px apart,
  groups 32px, sections 64px.
- **Validation:** validate on blur after first blur, re-validate on input once invalid, never on
  first keystroke. Errors go next to the field, and the summary gets focus on submit failure.
- **Modal is a last resort.** Inline > popover > drawer > modal. A modal must interrupt for a
  reason the user already has in mind.
- **Grey text on colour is wrong** — use a tint of the background hue instead.
- **Emphasis order:** weight and colour first, size last. Size is the crude tool.
- **Icon-only buttons** need an accessible name and are only safe for universally known actions.
- **One primary button per view.** Everything else is secondary or tertiary.
- **Charts:** position beats length beats angle beats area beats colour. Label directly instead
  of using a legend; sort categories by value; title the chart with the finding.
- **Tables** are the right answer more often than charts when exact values matter. Numbers right-
  aligned, tabular figures.
- **When no pattern fits:** state the user's goal, list what they must perceive, decide and do,
  then design the shortest path that keeps every step reversible.

## Creativity

The defaults above produce a competent, unremarkable interface — which is the correct floor, not
the goal. Each chapter has a **Judgment calls & creative license** section naming where the rules
flatten work into sameness: type that never risks a real display face, layouts that never break
the grid on purpose, palettes with no character, motion with no personality, copy with no voice.
Spend the attention the defaults saved you on one or two deliberate, well-executed departures —
and keep everything else systematic so those departures read as intent.

## Honesty about sources

Rules carry tags: `[Norman]` `[Krug]` `[Cooper]` `[Tidwell]` `[RUI]` `[Bringhurst]` `[Tufte]`
`[Itten]` `[Müller-Brockmann]` `[Ruder]` `[Lupton]` `[Nahai]` `[Krishna]` `[Webflow]` — and
`[modern]` for everything supplied beyond the books (WCAG 2.2, CSS Grid, container queries,
tokens, dark mode, touch, Core Web Vitals, AI surfaces). Several corpus claims did not survive
replication — per-hue colour emotion, Wansink's portion research, gendered aesthetic preference,
"above the fold" — and are flagged where they appear. Treat `[modern]` as current best practice
worth verifying when stakes are high, and book tags as "this is what that author argued."

---
name: voxlabs-ui
description: Voxlabs house UI rules. Use for any visible UI change in app/** or components/**, or when the user says UI, UX, design, layout, looks or polish.
---

# Voxlabs UI rules

Voxlabs is a dense, dark, keyboard-first audiobook editor. Keep changes small and consistent with what exists.

## Design system

- Dark only (`color-scheme: dark`). Surfaces: `bg-neutral-950` page, `neutral-900` cards and inputs, `neutral-800` borders, hover and selected states. Body text `neutral-100`, secondary `neutral-400`/`neutral-500`.
- Accent is purple: `#7c3aed` as the reference hex, Tailwind `purple-500` for bars, sliders (`accent-purple-500`) and done states, `purple-900`/`purple-950/40` for chips and the current row. Use `text-purple-300` for emphasis (overridden values, "In use"). The logo uses `#a78bfa`.
- Primary buttons are white (`btn-primary`), not purple. Do not add new accent colours.
- Reuse the classes in `app/globals.css`; never re-create them inline: `btn`, `btn-primary`, `btn-ghost`, `btn-sm`, `btn-danger`, `input`, `label`, `card`.
- Reuse components instead of writing new ones:
  - `Modal` (title, onClose, `wide`; Escape and backdrop click close it), `Field` (label + control), `ErrorText` from `components/ui.tsx`.
  - `Logo` from `components/Logo.tsx` for the wordmark (system fonts only, has `aria-label`).
  - `VoicePicker` / `VoiceBrowser` from `components/VoicePicker.tsx` for any voice choice.
- Layout: fixed 176px sidebar (`components/Nav.tsx`, `w-44`), content on the right. Text sizes stay small: `text-sm` UI, `text-xs` meta, `text-[15px]` editor text.

## Editor rules (components/studio/ParagraphRow.tsx)

Rows are dense and keyboard-driven. Never break these keys (skipped during IME composition):

- Enter: caret at end adds a row below; at start adds a row above; in the middle splits the row.
- Shift+Enter: plain newline inside the row.
- Ctrl/Cmd+Enter: regenerate this row.
- Backspace at start: on an empty row deletes it; otherwise merges into the row above (just moves up if that row is a pause).
- Delete at end: merges the next row in (not a pause row).
- ArrowUp/ArrowDown on the first/last visual line: move to the previous/next text row.
- Multi-line paste: one row per line; pause lines stay their own rows.

Other rules:

- Row actions (Play, Regenerate, History, + Text/Pause above/below, Delete) are hover-only via `opacity-0 group-hover:opacity-100`. Keep `group-focus-within:opacity-100` on any hover-only control so keyboard users can reach it.
- Status colours (left border and status text): purple done (`border-purple-500`), amber stale (`border-amber-400`, "Changed since generated") and queued (`border-amber-500`), sky generating (`border-sky-400 animate-pulse`), red error (`border-red-500`, `text-red-400`). Do not reuse these colours for other meanings.
- Hindi/Devanagari text wraps and never truncates in the editor or history: no `truncate`, `line-clamp` or fixed heights on paragraph text. The textarea auto-grows.
- Keep the Devanagari font stack on `body` in `app/globals.css` and the `lang={project.language}` attributes in `ParagraphRow.tsx` and `Studio.tsx`.

## Accessibility

- Text contrast at least 4.5:1 on `neutral-950`/`neutral-900`. `neutral-500` is the lowest for small text; do not go darker.
- Visible focus on every control. `.input` and the editor textarea use `outline-none`, so give them a visible focus style (border or ring); do not remove focus outlines elsewhere.
- Every input has a label (`Field`, `<label>`, or `aria-label`).
- Icon-only buttons (✕, ▶, ⟳, −1s) need an `aria-label`; `title` alone is not enough.

## Review loop

Never run `next dev` or `next build` in the live folder: the user's app runs from it on port 3000. Do not touch `./data` or `./.next`.

1. Copy the repo to a temp folder (skip `data`, `.next`, `node_modules`; symlink or install `node_modules`), then build there.
2. Start the mock: `node scripts/mock-cartesia.mjs 4010`.
3. Start the copy on port 3001: `AUTH_DISABLED=1 CARTESIA_BASE_URL=http://localhost:4010 CARTESIA_API_KEY=sk_car_mock DATA_DIR=<tmp> npx next start -p 3001`.
4. Screenshot at 1366x768 and 1920x1080 with host headless Chrome (files Chrome writes must live under /home/bcs):
   `flatpak-spawn --host --directory=/home/bcs google-chrome --headless=new --user-data-dir=/tmp/<x> --window-size=1366,768 --screenshot=/home/bcs/<file>.png http://localhost:3001/`
5. Read the screenshots, fix, repeat.
6. Clean up: stop the mock and port 3001 by PID (not a broad `pkill`), delete the temp folder and screenshots.

## Which skill when

- `ui-ux-pro-max`: direction, palettes and fonts.
- `impeccable`: polish, audit and critique.
- `frontend-design`: avoid generic, templated looks.
- `baseline-ui`: quick spacing and hierarchy pass.
- `fixing-accessibility`: run before shipping.
- `ponytail`: scope; make the smallest complete change.

These house rules win over any of them.

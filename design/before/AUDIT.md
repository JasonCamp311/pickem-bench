# Hallmark audit of the site before the overhaul

Audited: `web/src/index.css`, `web/src/App.tsx`, `web/src/views.tsx`,
`web/src/season.tsx`, `web/src/breakdown.tsx`, and the screenshots in this
folder. Nothing was edited. Genre graded as atmospheric (dark, tool-like).

## Pre-emit scores (1 to 5)

| Axis | Score | Why |
|---|---|---|
| Philosophy | 4 | A clear idea (sportsbook board) that the title, ticker and color meanings all serve. |
| Hierarchy | 3 | The masthead dominates; below it every sheet has the same weight, and an empty Standings box sits above the real content. |
| Execution | 3 | Tidy and consistent, but untokenized spacing, 11 label sizes, and no state transitions. |
| Specificity | 4 | Split-flap title, circled underdogs and the ticker are its own. |
| Restraint | 3 | Six decorative effects run at once (dot grid, grain, sparks, scramble, flaps, glow). |
| Variety | 2 | Every section is the same bordered sheet with the same heading row. |

## Critical

None. No purple-gradient hero, gradient text, centered template, or one-font page.

## Major

```
[major] Card-in-card — index.css .sheet / .profile / .why panels (L74, L555, L612+)
  Bordered panels sit inside bordered sheets on Profiles, Breakdowns and Recap; three nested outlines in places.
  → Keep one containment layer; separate inner groups with rules or space.

[major] Side-stripe card — "Week N in short" recap (index.css .recap)
  A thick pink left border on a bordered panel.
  → Hairline all round, or drop the box and set the recap as lead text.

[major] Every section padded and framed the same — index.css .sheet (L74)
  Standings, card, season, teams and method are the same box at the same spacing.
  → Give the lead content (card or standings) a different scale from supporting sheets.

[major] Decoration without information — App.tsx L342-347, L435-439
  Dot grid, click sparks and film grain respond to the pointer but say nothing about the data.
  → Keep one ambient layer; spend motion on scores, ranks and results instead.

[major] Scramble on every heading — App.tsx Heading (L67-75)
  Each sheet title decrypts on scroll, and again on every view change.
  → One orchestrated entrance; headings otherwise just appear.

[major] Hover-only detail on desktop — views.tsx pick tooltips
  A model's reason is only in a tooltip on wide screens (phones get it in the expanded row).
  → Already reachable by focus and by "Game breakdowns"; keep those paths obvious.

[major] No state feedback on controls — index.css (no transition or :active anywhere)
  Tabs, week buttons, chips and table rows change instantly with no press state; only 5 :hover rules exist.
  → Add hover, press and focus states with short ease-out transitions.
```

## Minor

```
[minor] Mid-render token improvisation — App.tsx L21, L34-35, L344, L347; index.css rgba() glows
  Hex values repeated in JSX props instead of reading the CSS variables.
  → Lift into tokens and pass by reference.

[minor] Type scale drift — index.css
  Label sizes at 11, 12, 12.5, 13, 14, 14.5, 15px.
  → Collapse to three steps.

[minor] Empty state leads the page — App.tsx Standings (L172-175)
  Before the first graded game the first sheet under the ticker is an empty box.
  → Collapse or reorder while there is nothing to rank.

[minor] Ticker cannot be paused — App.tsx Ticker (L45-65)
  Moves forever with no pause on hover or focus and no control (WCAG 2.2.2); it does stop under reduced motion.
  → Pause on hover and focus, add a pause button.

[minor] Straight quotes in copy — App.tsx empty states, season.tsx
  → Curly quotes.

[minor] Bundle weight — docs/assets/app.js 537 KB (174 KB gzipped)
  GSAP with InertiaPlugin is loaded only for the backdrop dot grid.
  → Reconsider if the dot grid goes.
```

Summary — 0 critical · 7 major · 6 minor
Verdict — close: it has an identity and avoids the template, but it reads as
effects layered on a table rather than a board that is alive.

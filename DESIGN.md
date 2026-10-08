---
name: Pick'em Bench
description: AI models fill out the same NFL card every week and get graded against the closing line.
colors:
  counter: "#0b0e2a"
  stock: "#131845"
  stock-shade: "#0f1338"
  flap-tile: "#161c52"
  dot-idle: "#1a2060"
  ink: "#e9ecff"
  ink-soft: "#99a2d8"
  rule: "rgba(120, 150, 255, 0.2)"
  blue: "#4cc9ff"
  pink: "#ff5fae"
typography:
  display:
    fontFamily: "Chakra Petch, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "clamp(44px, 11vw, 108px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  headline:
    fontFamily: "Chakra Petch, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  title:
    fontFamily: "Chakra Petch, Bahnschrift, Arial Narrow, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    fontVariation: "'wdth' 82"
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  tile: "2px"
  chip: "3px"
  sheet: "4px"
  panel: "6px"
  team: "999px"
spacing:
  hair: "4px"
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
  section: "36px"
  break: "48px"
components:
  sheet:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  tab:
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    rounded: "{rounded.sheet}"
    padding: "8px 16px"
  tab-active:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.counter}"
  week-button:
    textColor: "{colors.blue}"
    rounded: "{rounded.tile}"
    padding: "4px 10px"
  week-button-active:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.counter}"
  chip:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.chip}"
    padding: "1px 7px"
  profile-panel:
    backgroundColor: "{colors.stock-shade}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: Pick'em Bench

This file describes the site as shipped by the design overhaul of October 2026.
Screenshots from before and after are in `design/before` and `design/after`.

## Overview

**Creative North Star: "The sportsbook board after dark"** (the name is taken
from the comment at the top of `web/src/index.css`; not yet confirmed as the
name to keep).

The page is one long board. A split-flap title clicks into place, a ticker of
talking points runs under it, and everything below is a dense sheet of picks set
in a condensed tabular face. It is a data site wearing the costume of a
departure board and a betting window: dark indigo surfaces, two neon signals,
squared-off corners, hairline rules. The voice of the copy is plain and dry; the
personality is carried almost entirely by the masthead, the ticker, the two
colors and the display face.

Density is high and deliberate. The card shows 15 games by 6 to 8 contestants
with a score, a confidence and two tags per cell, and the layout never trades
that away for air. On phones the tables become stacked scoreboards and the tab
rows become horizontal strips.

**Key Characteristics:**
- Dark only. No light theme.
- Two signal colors with fixed meanings, on indigo.
- Mechanical display type (Chakra Petch, uppercase) over a condensed data face (Archivo at 82% width, tabular figures).
- Nearly square corners, hairline borders, almost no shadow.
- Everything answers: controls have hover and press states, numbers roll, rows deal in, panels light up under the pointer. The motion spec is at the end of Components.

## Colors

Deep indigo ground, one electric blue, one hot pink. Nothing else carries meaning.

### Primary
- **Board Blue** (`blue`): the house color. Active section tab, week buttons, model names, links, winning picks, confidence bars.

### Secondary
- **Upset Pink** (`pink`): picks against the favorite (circled team), losses, the active view tab and track tab, focus rings, ticker separators, the "in short" recap heading.

### Neutral
- **Counter** (`counter`): the page.
- **Stock** (`stock`): every sheet (the panels that hold tables).
- **Stock Shade** (`stock-shade`): surfaces set into a sheet: tab rails, profile panels, breakdown panels.
- **Ink** (`ink`) and **Soft Ink** (`ink-soft`): text and secondary text.
- **Rule** (`rule`): every border and table line.

### Named Rules
**The Two Signals Rule.** Blue means house, selected or won. Pink means upset, against the market or lost. No third accent exists.

**The Neon Line Rule.** The blue-to-pink gradient appears only as a 1px line: above and below the ticker and under each sheet heading. It is never a fill and never on text.

## Typography

**Display Font:** Chakra Petch 600/700 (with Bahnschrift, Arial Narrow)
**Body Font:** Archivo Variable (with Segoe UI, system-ui)

**Character:** A squared, engineered display face that reads like signage, over a workhorse grotesque narrowed to 82 to 88% width wherever numbers pile up.

### Hierarchy
- **Display** (700, clamp(44px, 11vw, 108px), 1.0): the split-flap title only.
- **Headline** (700, 26px, uppercase, 0.04em): one per sheet ("STANDINGS", "THE CARD").
- **Title** (700, 20 to 24px): model names on profiles, stat figures, matchup names.
- **Body** (400, 16px/1.5; 18px for the masthead line): prose, capped near 58 to 76ch.
- **Data** (700, 17px, 82% width, tabular figures): predicted scores in the card.
- **Label** (400 to 600, 12 to 14.5px): tags, captions, table headers. Eleven distinct sizes between 11px and 15px are in use.

### Named Rules
**The Tabular Rule.** Any column of numbers is tabular and condensed.

## Layout

A single centered column, 1180px wide at most, with 16px side padding. Sheets
stack vertically with 36px between them and 48px above each tab row. Inside a
sheet the padding is 18 to 20px. The card is a real table with a sticky first
column that scrolls sideways when it runs out of room.

One breakpoint at 720px. Below it: standings and the card become stacked lists
with `<details>` rows, tab rows and game chips become horizontally scrolling
strips with a fade on the right edge, and the teams view becomes a select plus
per-game blocks.

Spacing is not tokenized. Values in use cluster at 4, 6, 10, 16, 20, 36 and 48px.

## Elevation & Depth

Flat. Depth comes from three indigo steps (counter, stock, stock shade) and 1px
rules. Shadows sit under the sticky tabs, the toast and the tooltip.

### Named Rules
**The Glow Rule.** Glow marks what is selected or live: the masthead, the active tab pill, the highlighted chart line.

## Shapes

Squared. Radii run 2px (week buttons, picks), 3px (chips, tags), 4px (tabs),
6px (sheets and inset panels). The single round shape is the pill drawn around a
team picked against the favorite, which is why it reads as a mark.

## Components

### Masthead
Two rows of split-flap tiles, pink over blue, padded to seven tiles. Flips
through the alphabet once on load; pressing the title runs it again. Two soft
pools of pink and blue light drift slowly behind it.

### Backdrop
A field of short dashes on a staggered 34px grid, like hash marks. Dashes within
190px of the pointer turn to aim at it, lengthen and shift from indigo through
blue to pink; a press sends a ring outward that spins the dashes it crosses. One
canvas, redrawn only while something is moving (`Needles.tsx`).

### Football touches
- **Team chips:** every team abbreviation carries a small square split diagonally in the team's two colors (`web/src/lib/teams.ts`). No logos or league marks are used.
- **Field numbers:** on windows 1440px and wider, faint 10 to 50 numerals run down both sides of the page, turned to face the sideline, and scroll with it.
- **Models vs the line** is drawn as a field: a stripe every seven points, hash marks every point along both edges, and each team's end tinted in its own color.
- **Opening a dot** on that chart grows the row's field: sidelines, numbered yard lines, and the home team's abbreviation on a two-color mark at midfield, with that model's reasoning dropping in underneath. One dot is open at a time.
- **Confidence bars** are a drive: a yard line every ten percent and a football riding the leading edge.

Team colors identify teams only. Blue and pink keep their meanings; a team color never marks a result.

### Headings
Sheet headings flip in letter by letter, each on a hinge at its top edge, 26ms
apart, landing pink and cooling to white. This echoes the split-flap title.

### Status board
A readout to the right of the title (below it under 900px): the current week
and its state behind a pulsing dot, the next kickoff with a clock that rolls
every second, games awaiting results, and the leader against the spread once
games are graded. The next kickoff opens that game's breakdown.

### Ticker
One line of talking points between two neon rules, running the full width of
the window with faded ends. Content is computed from the week on screen
(`headlines()` in `web/src/lib/card.ts`). It scrolls left at 46px a second and
speeds up or reverses with page scroll velocity. It eases to a stop under the
pointer, under keyboard focus, or when the pause button at its left end is
pressed. A line about a game is a button that opens that game's breakdown. When
the lines change (another week, the other track, new results) they come in again
and a bar of light crosses the ticker once. With reduced motion it stands still
and wraps.

### Tabs
A rail of text buttons with a filled pill that slides between them on a spring.
Section tabs use blue and stick to the top of the window with a blurred
backing; view and track tabs use pink and a smaller size.

### Sheets
The container for everything: `stock` fill, 1px rule, 6px radius, a heading row
closed by a neon line. A soft pool of light follows the pointer across a sheet,
on its own layer moved by a transform; the status board and the recap also light
their border where the pointer is nearest.

### Standings
A grid of rows ranked by one column. Pressing a column heading re-ranks by that
column and rows slide to their new places; the ranked column is tinted and the
top model is marked in pink and blue. Records roll like an odometer.

### The card
A table of picks. Each cell: team and predicted score, "NN% sure", then two
outlined tags. Rows deal in from the top. A graded cell is tinted blue or pink
and its pick ends in a drawn check, cross or gold star (exact final). Reasons
live in a tooltip (tap on touch, hover or focus elsewhere).

### Who agrees
A grid of squares, brighter for pairs that agree more. The pair under the pointer or focus is named in a line under the grid and its row and column headings turn pink; the diagonal is hatched because a model is not compared with itself.

### Profiles
Three-across panels that lean a few degrees toward the pointer, with a spotlight
and rolling figures.

### Charts
Hand-built SVG. Solid lines draw themselves when scrolled into view; the
highlighted series glows and its points spring to the newly chosen series.

### Toast
One note, bottom center, when an open page finds newer results (it re-checks
every five minutes while visible). Springs up, leaves on its own after six
seconds or when dismissed.

### Motion
Tokens live in `:root` in `web/src/index.css`, mirrored in `web/src/lib/motion.ts`.

| Token | Value | Used for |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering or answering the pointer |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Things moving across the screen (light sweep, drifting glow) |
| `--dur-press` | 120ms | Press squeeze, `scale(0.96)` |
| `--dur-hover` | 160ms | Color, border and background on hover |
| `--dur-ui` | 240ms | Arrows, chevrons, panel borders |
| `--dur-roll` | 900ms | Rolling digits, 35ms later per place from the right |
| `PILL` | spring, stiffness 420, damping 34 | Tab pill |
| `REORDER` | spring, 0.6s, bounce 0.14 | Standings rows changing rank |
| `FOLLOW` | spring, stiffness 180, damping 20, mass 0.6 | Panel tilt |
| `STAGGER` | 40ms | Gap between list items entering |

- **On load:** title flaps, then board, ticker, track switch, standings, tabs and the card rise 18px in that order, 80ms apart.
- **Changing section or view:** the old one leaves in 120ms; the new one slides in 28px from the side its tab sits on with a short blur, 340ms.
- **Rows:** card rows and phone scoreboard rows enter 32ms apart; standings rows 45ms apart.
- **Opened rows** on phones unfold where the browser supports animating `<details>`.
- **Only transform, opacity, filter and color are animated**, except the unfolding rows (height) and the dots on "Models vs the line" (left).
- **Focus rings are never animated.**
- **Reduced motion:** the backdrop, glow, grain and sparks are removed, the ticker stands still, and every transition and animation is cut to 1ms.

## Do's and Don'ts

### Do:
- **Do** keep blue and pink to their meanings.
- **Do** keep numbers tabular and condensed.
- **Do** keep the ticker as a single line between two rules.
- **Do** use the motion tokens for anything new that moves.

### Don't:
- **Don't** add a third accent color.
- **Don't** use the neon gradient as a fill or on text.
- **Don't** put a blend mode on a full-screen layer; it costs a repaint of the whole page on every scrolled frame.
- **Don't** change track 1's or track 2's prompt, ids or any data when changing the look.

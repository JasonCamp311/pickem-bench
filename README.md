# Pick'em Bench

AI models pick every NFL game from the same football-only prompt, then get graded
against the closing line. Zero dependencies, Node 22+.

## How it works

1. **Slate.** `slate` pulls the week's schedule from ESPN and builds a dossier per
   team from this season's final scores: record, home/road splits, points for and
   against, streak, rest days. No betting lines go into the slate or the prompt.
2. **Pick.** `pick` sends every contestant in `models.json` the identical prompt and
   asks for a final score and a win probability per game. Replies are validated and
   retried with the errors if malformed. Each pick file is written once, hashed into
   `lock.json`, and never overwritten.
3. **Lines.** `lines` snapshots the current spread for games that have not started.
4. **Grade.** `grade` pulls final scores and the closing spread, then scores each pick:
   straight-up, against the spread, over/under, exact scores, Brier score, margin error.
5. **Site.** Every command rebuilds `docs/data.json`, which the page in `docs/` renders.

Against-the-spread is implied rather than asked for: a model that has the home team
by 3 against a line of -6.5 is on the away side. Only picks timestamped before
kickoff are graded, and a pick file that no longer matches its lock hash is flagged.

Two baselines run alongside the models: always-home and always-favorite. The model
consensus (the average of the models' predicted scores) is graded as one more
contestant. Each model also names a lock of the week, an upset of the week and a
first-half leader per game; picks locked before those fields existed simply lack them.

## Two tracks

The original prompt is track 1 (`v1`) and never changes. Track 2 (`v2`) runs the
same models on the same games with a richer sheet, so each model can be compared
with itself:

- `src/ratings.js` turns every final score since 2020 (`data/history/` plus this
  season) into two ratings per team, an Elo rating with margin of victory and a
  ridge-regressed offense and defense rating, and blends them into a predicted
  score and win probability per game. Still no betting line anywhere.
- The track 2 prompt shows those ratings, the score they imply, last season's
  totals and the injury report, and tells the models to move off the implied
  score only for a reason.
- `math-v2` ("Ratings only") is the implied score with no model, locked like any
  other pick. If a model cannot beat it, the model added nothing.

`node src/cli.js pick --track v2` builds `slate-v2.json` (frozen at the first v2
pick, like `slate.json`) and writes pick files whose ids end in `-v2`. Both tracks
share the week folder, the lock file, the lines and the grading. `models.json`
marks track 2 entries with `"track": "v2"`.

The rating parameters were fitted on 2021-2024, checked on 2025 and frozen;
`node tools/backtest.js` reruns that walk-forward test, and `--search` reruns the
fit. Changing a parameter or the track 2 prompt changes what the track measures,
so do it under new contestant ids rather than in place. The site's Season page
compares each model's two versions game by game, on margin miss and Brier score.

## Weekly routine

```sh
node src/cli.js pick      # Tuesday or Wednesday, before Thursday night kickoff
git add data docs && git commit -m "Week N picks"   # the commit is the public lock
node src/cli.js check     # optional: flag reasons that contradict the data sheet
node src/cli.js lines     # optional, any time before kickoff
node src/cli.js grade     # Tuesday morning, after Monday night
node src/cli.js serve     # http://localhost:8490
```

All commands take `--season` and `--week`; the default is ESPN's current week.
`pick --model gpt,claude` limits the run to some contestants.

## The site

`web/` is a Vite + React + Tailwind app; `npm run build` in `web/` writes it to
`docs/`, next to `data.json`. The CLI only ever rewrites `data.json`, so weekly
runs need no site build and no npm install. For live editing run
`node src/cli.js serve` and `npm run dev` in `web/` side by side.

The page has four sections:

- **This week**: a short recap, the card, game breakdowns (each model's reason next
  to the data it was shown and the market's view), models vs the line, who agrees
  with whom, and model profiles.
- **Season**: the running record against the spread, a flat $100-a-game bankroll,
  and calibration plots.
- **Teams**: every model's predicted margin for one team, game by game.
- **How it works**: the method and the prompt, word for word.

Below 720px wide the page switches to phone layouts: the card becomes a list
of games showing which models are on each team (tap one for every pick and
reason), the standings become a tap-to-expand list, the tab rows scroll sideways,
and tooltips and chart readouts open with a tap. `web/src/lib/narrow.ts` holds the
width check; the styles are the "Phones" block at the end of `web/src/index.css`.

A fifth section, **Betting**, only appears when the page is opened from
`node src/cli.js serve` on the same machine. It ranks where the models disagree
most with the line and keeps a personal bet log in `private/bets.json`, which is
git-ignored and never part of the published site.

`node tools/demo.js <scratch-dir>` builds a fake three-week season in a scratch
folder for working on the graded views before real results exist.

The split-flap headline, tooltips, click sparks, film grain and spotlight cards
are React Bits components (`web/src/components`), added through the shadcn CLI
with the registries in `web/components.json`. The ticker, rolling numbers,
result marks, tilting cards and the backdrop of pointer-following dashes are
written for this site. `DESIGN.md` describes the look and the motion.

## Running it unattended

`ops/` holds the pieces for a Linux box: `run.sh pick|grade` pulls, runs, commits
and pushes only when the data really changed, and two systemd user timers call it
(picks Tuesday and Wednesday at 10:00, lines and grading daily at 08:00). Track 2
picks on Wednesday only, when the injury report is fuller, with a retry on the
daily run through Saturday.
`ops/install.sh` installs and starts them. With no `--week`, `pick` targets the
first week that still has a game to play and `grade` covers every week on disk
with a game waiting on a result, so neither depends on when ESPN rolls its week
over. Set `PICKEM_NTFY` in `.env` to an ntfy topic URL to hear about failures.

The machine running the timers should be the only one committing `data/`.

## Setup

Copy `.env.example` to `.env`.

- `OPENROUTER_API_KEY` runs the hosted models. Without it they are skipped.
- `OLLAMA_HOST` points at the local model. Ollama on fedora listens on loopback, so
  from another machine open a tunnel first: `ssh -N -L 11435:127.0.0.1:11434 fedora`.

Edit `models.json` to change the lineup. Changing a contestant's model mid-season
makes its record a blend, so add a new id instead.

## What the "no Vegas" claim does and does not mean

The prompt contains no lines and the models have no tools or web access. They do
have their training data, which can include preseason expectations for these teams.
The benchmark measures prediction from the same inputs, not prediction from zero.

## Credits

See `THIRD_PARTY.md` for data sources, fonts and component licenses.

## Tests

`node test/selftest.js` runs offline: line parsing, prompt contents, reply
validation, grading math, and an end-to-end build with a late and a tampered entry.

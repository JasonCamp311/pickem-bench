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
   straight-up, against the spread, exact scores, Brier score, margin error.
5. **Site.** Every command rebuilds `docs/data.json`, which the page in `docs/` renders.

Against-the-spread is implied rather than asked for: a model that has the home team
by 3 against a line of -6.5 is on the away side. Only picks timestamped before
kickoff are graded, and a pick file that no longer matches its lock hash is flagged.

Two baselines run alongside the models: always-home and always-favorite.

## Weekly routine

```sh
node src/cli.js pick      # Tuesday or Wednesday, before Thursday night kickoff
git add data docs && git commit -m "Week N picks"   # the commit is the public lock
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

The split-flap headline, ticker, tooltips, count-up numbers and paper grain are
React Bits components (`web/src/components`), added through the shadcn CLI with
the registries in `web/components.json`.

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

## Tests

`node test/selftest.js` runs offline: line parsing, prompt contents, reply
validation, grading math, and an end-to-end build with a late and a tampered entry.

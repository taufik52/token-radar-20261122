# Token Radar — pre-token protocols ranked by implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taufik52/token-radar-20261122/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taufik52/token-radar-20261122/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the [make.fun](https://make.fun/) bounty **token-radar-01** — build the best token launch radar. The program reads a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14) and writes a dashboard that ranks the 200 most promising pre-token protocols by implied launch value, each with a concrete farm plan.

## What it does

- **Covers the whole watchlist** — all 40 protocols at or above the $50M TVL floor that record no token — plus the 160 largest pre-token protocols below the floor, found early by the radar.
- **Ranks by implied value, not TVL alone** — the `launch-odds-2` model separates *potential* (what a launch could be worth) from *launch probability* (how launch-shaped the record looks), then multiplies them.
- **Shows a farm plan for every row** — 6 steps each, with capital, gas cost, and time, derived from the protocol's category, chains, TVL, and age.
- **Keeps live-token protocols apart** — protocols whose token already trades appear in a separate tab with their market cap, never mixed into the pre-token ranking.
- **Fully offline dashboard** — sortable board, search, category / chain / risk filters, watchlist toggle, and a detail view for every protocol with the full model breakdown. No network requests.

## The model (launch-odds-2)

```
implied = round( launchProb × TVL × sector
                 × (1 + 0.30 × tanh(growth_7d / 30))
                 × (1 + 0.05 × (chains − 1)) )
launchProb ∈ [0.15, 0.92] from age with no token, 7-day growth,
             chain breadth, and log TVL
```

- **Potential** starts from TVL × a sector multiple — capital-forming protocols (lending, exchanges, derivatives) 0.34, consumer protocols 0.26, infrastructure (bridges, chains) 0.18, unknown category 0.25 — bent by growth through a tanh curve so an extreme week cannot explode the board, and widened 5% per extra chain.
- **Launch probability** is a bounded score from four snapshot signals: age with no token (older looks nearer), 7-day growth, chain breadth, and log TVL. It says the record *looks launch-shaped* — it never predicts whether or when a token appears.
- **Confidence & risk** travel with every row: confidence rises when growth and listing date are reported; risk rises for very young, single-chain, or sharply shrinking protocols.
- No protocol name is ever special-cased and no outside fact is used — every input is a number from the snapshot. The dashboard states the full formula, and the page shows each row's breakdown.

“Records no token” is deliberate: the snapshot is DefiLlama's record, not proof a protocol has no token.

## Run it

Requires Node.js 22.18+ (the repo runs on Node 24 in this workspace). The snapshot lives outside this repo (sealed kit input).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

That writes `out/board.json` (200 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/`, and `out/dossier.json`. The program is deterministic: two runs write byte-identical outputs. Standard library only — nothing to install.

## Layout

- `main.ts` — entry point: reads the snapshot, writes the outputs, builds the dossier
- `lib/model.ts` — the launch-odds-2 model, board builder, farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library (from the kit, unchanged)
- `dashboard/` — the offline page (`index.html`, `app.css`, `app.js`)
- `screenshots/` — board, detail, and filtered views of the dashboard
- `.makefun/owner.json` — claim file naming the entrant's wallet

## Provenance

Data: DefiLlama protocol index, fetched once for the snapshot (`as_of` 2026-11-14), floor $50,000,000. Implied values are this entry's own claim, never make.fun's. Farm plans never claim a points program, launch date, or funding the snapshot does not carry. Not financial advice — farming costs gas and can lose money.

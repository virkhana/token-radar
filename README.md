# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/virkhana/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/virkhana/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar for protocols that record no token yet: ranked by what their launch could be worth,
with the arithmetic shown and a farm plan for every row. Built for
[make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

The program reads a sealed snapshot of the protocol universe, separates the protocols whose token
already trades from the ones that record none, and prices the latter from the former. No protocol
name is special-cased: the only inputs are TVL, seven-day TVL growth, the day DefiLlama began
tracking the protocol, its category and its chains.

## What it writes

| File | What it is |
| --- | --- |
| `board.json` | The ranked board: 198 pre-token rows, ranks 1..N, each with its implied value, its band and a six-step farm plan. |
| `data.js` | The same board as the page's dataset, so the dashboard needs no server and no network. |
| `dashboard/` | `index.html`, `app.css` and `app.js`: the board, a detail view for every row, the model page and the live-token calibration. |
| `screenshots/` | The board, a detail view and a filtered view, 1440×900. |
| `dossier.json` | The screenshots and the page's source, as `vendor/makefun-board.ts` writes them. |

## The model, in one paragraph

Every protocol whose token already trades and whose record is clean gives one figure: its market
cap over its TVL. Those figures are winsorised at the market's 5th–95th percentile, then each
category's median is shrunk toward the market median by how few comparables it has
(`(n·median + 6·market) / (n + 6)`). That gives a multiple per category and a band from the market's
own log dispersion, divided by the square root of the comparables and capped at ±0.75 log units.
A pre-token row's implied value is:

```text
tvl × category multiple × (1 + 0.25 × clamp(change_7d, −40, +80) / 100)
    × (0.55 + 0.45 × min(age_days, 1825) / 1825)
```

Exchanges, versioned pools and wrapped, staked or bridged receipt tokens never enter the early
radar and never price a category: their TVL belongs to a token that already exists. A protocol that
records no token has not necessarily announced one, so the board says "pre-token", never "will
launch".

## Run it

The program needs Node.js 22.18 or later and no dependencies. Point `--input` at the sealed
snapshot (or mount it at `/input`) and `MAKEFUN_OUTPUT_DIR` at where the files should go:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ./snapshot.json
```

The dashboard is a static page: open `out/dashboard/index.html` from disk after a run. It reads
`out/data.js`, so it works with no server, no build step and no network. Use the toolbar to search
or filter by scope, category, chain and seven-day growth; every column header is a sort; click a
row for its arithmetic, its comparables and its farm plan.

## Layout

```text
main.ts                    reads the snapshot, writes the board, page, screenshots and dossier
lib/model.ts               the model: comparables, category prices, scores, bands, farm plans
dashboard/index.html       the page's shell
dashboard/app.css          the palette and the grid
dashboard/app.js           the board, detail, model and live-token views
vendor/makefun-board.ts    the kit's dossier writer, byte for byte
screenshots/               the three screenshots
```

## Notes

- The board is recomputed from whatever snapshot is mounted. Re-run it on a new fetch and every
  multiple, rank and band moves with the data; the radar is the function, not this list.
- The live-token page is calibration, not a second board: those protocols already have a token and
  are never ranked.
- Implied values are the entry's own claim, not an offer, and not a prediction that a token will
  launch.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

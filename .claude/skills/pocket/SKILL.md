---
name: pocket
description: Operational knowledge for the Pocket Hub toolkit (this repo). Two apps — Articles (English learning digests by category) and Invest (fund watch with buy/hold advice). Pluggable Cursor Cloud Agent LLM, Markdown notes + GitHub Pages site, Bark push. Load when the user asks about running jobs, adding sources/funds, Pages, Bark, inbox vs RSS, category filters, or debugging a failed digest. Prefer documented npm commands over re-implementing logic.
---

# Pocket Hub — Operational Skill

Pocket Hub is a **personal toolkit** with two apps:

| App | Pipeline |
|-----|----------|
| **Articles** | inbox or RSS (one article) → Cursor Cloud Agent → `notes/<category>/*.md` |
| **Invest** | `config/funds.yaml` → Eastmoney NAV + market volume + fund page/chart URLs → Cursor Cloud Agent (14:40 分时) → `notes/invest/*.md` |

Shared:

```text
notes → site/ (Hub + app archives) → Bark
```

Monorepo packages:

| Package | Role |
|---------|------|
| `@pocket/bark` | Devices, presets, `push()` |
| `@pocket/daily` | Jobs, sources, LLM, site builder, notify |
| `@pocket/cli` | CLI router |

## Project root assumption

All paths are relative to the repo root (contains `package.json`, `config/`, `packages/`).

```bash
cd /path/to/pocket
```

## Quick commands

| Need | Command |
|------|---------|
| List jobs | `npm run list` |
| List source roster | `npm run sources` / `npm run sources -- --category tech` |
| Run Articles (no Bark) | `npm run run:job -- --all --app articles --skip-delivery` |
| Run Invest (no Bark) | `npm run run:job -- --job invest-daily --skip-delivery` |
| Run one Articles job | `npm run run:job -- --job tech-daily --skip-delivery` |
| Rebuild Pages HTML | `npm run site` |
| Bark summary (Articles) | `npm run notify -- --all --app articles` |
| Bark Invest note | `npm run notify -- --job invest-daily` |
| Ad-hoc Bark | `npm run bark -- --to all --preset english --body "..."` |
| Typecheck | `npm run typecheck` |

## File map — where to change what

| Task | File |
|------|------|
| Add / disable / retarget an RSS source | `config/sources.yaml` |
| Wire a job to a source + inbox | `config/jobs.yaml` (`source.sourceId`, `category`, `app`) |
| Fund watchlist codes | `config/funds.yaml` |
| Bark title presets | `config/bark-presets.yaml` |
| Manual paste articles | `inbox/<category>.md` (`# Title` + body after `---`) |
| Note output | `notes/<category>/YYYY-MM-DD.md` |
| Generated site | `site/` (gitignored; deploy via Actions / gh-pages) |
| Hub / archive UI | `packages/daily/src/site/build-site.ts` |
| English note prompt | `packages/daily/src/topics/english-vocab.ts` |
| Fund advice prompt | `packages/daily/src/topics/fund-watch.ts` |
| Fund NAV fetcher | `packages/daily/src/sources/funds.ts` |
| Articles generate | `.github/workflows/daily.yml` (Beijing **07:30**) |
| Articles Bark | `.github/workflows/articles-notify.yml` (Beijing **08:00**) |
| Invest schedule | `.github/workflows/invest.yml` (Beijing 14:40, before 15:00 close) |

## Categories (Articles tabs)

`world` · `business` · `tech` · `dev` · `music` · `horror`

Invest notes live under `notes/invest/`.

Pages structure:

```text
site/index.html           # Pocket Hub
site/articles/index.html  # Articles archive
site/invest/index.html    # Invest archive
site/<category>/<date>.html
```

## Source roster (Articles)

Roster lives in [`config/sources.yaml`](../../../config/sources.yaml). Jobs reference `sourceId`.

Primary job → source mapping (defaults):

| Job | Category | Default `sourceId` |
|-----|----------|--------------------|
| `world-daily` | world | `bbc-world` |
| `business-daily` | business | `economist-finance` |
| `tech-daily` | tech | `9to5mac` |
| `dev-daily` | dev | `web-dev` |
| `music-daily` | music | `pitchfork-news` (optional skip) |
| `horror-daily` | horror | `bloody-disgusting` (optional skip) |
| `invest-daily` | invest | `config/funds.yaml` via source type `funds` |

Inbox wins when it has a real article body after `---`. Placeholder stubs count as empty → RSS fallback. `source.optional: true` skips when both empty (music/horror).

## Invest notes

- Watchlist: `config/funds.yaml` (`code` + optional `name`)
- Runs ~**14:40** Asia/Shanghai so the agent can read **分时** + market volume before 15:00 close
- **Trading-day gate**: weekends / holidays / stale 上证分时 → write 休市 note, **skip LLM**, no A–D grades
- Live days only: topic `fund-watch` requires per fund **买入等级** and **卖出等级** (`A`–`D`) plus the grade legend
- Site: Invest pages skip English vocab highlighting; grade badges styled on live notes
- Always keep a risk disclaimer in the note (not licensed advice)
- Demo Hub mock (optional): `demo/pocket-hub.html`

## Diagnostic flow

1. `npm run list` — job enabled? `app=` and category correct?
2. Articles: `npm run sources -- --category <cat>` — source enabled? URL right?
3. Invest: check `config/funds.yaml` codes; re-run `invest-daily --skip-delivery`
4. Check inbox: real body after `---`?
5. `npm run site` then open `site/index.html`
6. Bark: `npm run bark -- --list` then `--presets`; secrets on Actions must be Repository secrets

## GitHub Actions

**Articles generate** — `.github/workflows/daily.yml` (Beijing 07:30 / UTC 23:30)

1. Generate `--all --app articles --skip-delivery`
2. `npm run site`
3. Commit `notes/`
4. Deploy `site/` → `gh-pages`

**Articles Bark** — `.github/workflows/articles-notify.yml` (Beijing 08:00 / UTC 00:00)

1. `notify --all --app articles` (link to Articles archive)

**Invest** — `.github/workflows/invest.yml` (Beijing 14:40 / UTC 06:40)

1. `run:job -- --job invest-daily --skip-delivery`
2. `npm run site` + commit + deploy
3. `notify --job invest-daily`

Secrets: `CURSOR_API_KEY`, `BARK_DEVICES`, `BARK_KEY_daj`, `BARK_KEY_lzx`, optional `BARK_SERVER`.

Pages URL: `https://mangomaster13.github.io/pocket/` (set `PAGES_BASE_URL`).

## What NOT to do

- Don't hardcode RSS URLs in TypeScript when `config/sources.yaml` can hold them
- Don't hardcode fund codes in TypeScript when `config/funds.yaml` can hold them
- Don't make Bark carry full notes — teaser + Pages URL only
- Don't import `@pocket/daily` from `@pocket/bark`
- Don't delete disabled sources from the YAML — set `enabled: false` + `notes`
- Don't add Playwright casually for paywalled sites — use inbox paste instead
- Don't present Invest output as licensed financial advice; keep the disclaimer

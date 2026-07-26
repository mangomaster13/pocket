---
name: pocket
description: Operational knowledge for the Pocket toolkit (this repo). English learning digests by category (world/business/tech/dev/music/horror), pluggable Cursor Cloud Agent LLM, Markdown notes + GitHub Pages site, Bark push. Load when the user asks about running jobs, adding sources, Pages, Bark, inbox vs RSS, category filters, or debugging a failed digest. Prefer documented npm commands over re-implementing logic.
---

# Pocket — Operational Skill

Pocket is a **personal English-notes toolkit**, not a multi-source news dashboard like [DailyBrief](https://github.com/leiting-eric/DailyBrief). Pipeline:

```text
inbox or RSS (one article) → Cursor Cloud Agent → notes/<category>/*.md → site/*.html → Bark
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
| Run all categories (no Bark) | `npm run run:job -- --all --skip-delivery` |
| Run one category | `npm run run:job -- --job tech-daily --skip-delivery` |
| Rebuild Pages HTML | `npm run site` |
| Bark summary after deploy | `npm run notify -- --all` |
| Ad-hoc Bark | `npm run bark -- --to all --preset english --body "..."` |
| Typecheck | `npm run typecheck` |

## File map — where to change what

| Task | File |
|------|------|
| Add / disable / retarget an RSS source | `config/sources.yaml` |
| Wire a job to a source + inbox | `config/jobs.yaml` (`source.sourceId`, `category`) |
| Bark title presets | `config/bark-presets.yaml` |
| Manual paste articles | `inbox/<category>.md` (`# Title` + body after `---`) |
| Note output | `notes/<category>/YYYY-MM-DD.md` |
| Generated site | `site/` (gitignored; deploy via Actions / gh-pages) |
| English note prompt / finalize | `packages/daily/src/topics/english-vocab.ts` |
| Site UI (tabs, highlights) | `packages/daily/src/site/build-site.ts` |
| Source roster loader | `packages/daily/src/sources/catalog.ts` |
| GitHub Actions schedule | `.github/workflows/daily.yml` |

## Categories (Pages tabs)

`world` · `business` · `tech` · `dev` · `music` · `horror`

Each enabled job writes **one note per day** into `notes/<category>/`. Pages archive filters by category + date.

## Source roster (DailyBrief-inspired)

Roster lives in [`config/sources.yaml`](../../../config/sources.yaml) — single place to add feeds. Jobs reference `sourceId` instead of hardcoding URLs.

Primary job → source mapping (defaults):

| Job | Category | Default `sourceId` |
|-----|----------|--------------------|
| `world-daily` | world | `bbc-world` |
| `business-daily` | business | `economist-finance` |
| `tech-daily` | tech | `9to5mac` |
| `dev-daily` | dev | `web-dev` |
| `music-daily` | music | `pitchfork-news` (optional skip) |
| `horror-daily` | horror | `bloody-disgusting` (optional skip) |

Switch a job's feed: edit `source.sourceId` in `jobs.yaml`, or set `rssUrl` to override.

Inbox wins when it has a real article body after `---`. Placeholder stubs (instructions only) count as empty → RSS fallback. `source.optional: true` skips the job when both are empty (music/horror).

## Mental model vs DailyBrief

| DailyBrief | Pocket |
|------------|--------|
| Many sources → one HTML digest | One article → one learning note per category |
| Enrich every headline | Vocab + long sentences + source article |
| Trading / GH trending / X | Not in scope |
| `sources.config.json` | `config/sources.yaml` |
| Operational skill in `.claude/skills/` | This file |

Do **not** port DailyBrief's trading panel, scrape fetchers, or multi-item merge unless the user explicitly asks. Prefer better English sources + note quality.

## Diagnostic flow

1. `npm run list` — job enabled? category correct?
2. `npm run sources -- --category <cat>` — source enabled? URL right?
3. Check inbox: real body after `---`?
4. Re-run one job with `--skip-delivery` and read `notes/<category>/`
5. `npm run site` then open `site/index.html`
6. Bark: `npm run bark -- --list` then `--presets`; secrets on Actions must be Repository secrets

## GitHub Actions

Workflow: `.github/workflows/daily.yml`

1. Generate (`--all` or one job) with `--skip-delivery`
2. `npm run site`
3. Commit `notes/`
4. Deploy `site/` → `gh-pages`
5. `notify --all` (unless skip_delivery)

Secrets: `CURSOR_API_KEY`, `BARK_DEVICES`, `BARK_KEY_daj`, `BARK_KEY_lzx`, optional `BARK_SERVER`.

Pages URL: `https://mangomaster13.github.io/pocket/` (set `PAGES_BASE_URL`).

## What NOT to do

- Don't hardcode RSS URLs in TypeScript when `config/sources.yaml` can hold them
- Don't make Bark carry full notes — teaser + Pages URL only
- Don't import `@pocket/daily` from `@pocket/bark`
- Don't delete disabled sources from the YAML — set `enabled: false` + `notes`
- Don't add Playwright casually for paywalled sites — use inbox paste instead

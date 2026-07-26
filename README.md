# Pocket

<p align="center">
  <img src="assets/icon.png" alt="Pocket icon" width="120" />
</p>

Personal pocket toolkit — digests, Bark messaging, and more modules later.

Monorepo packages:

| Package | What it does |
|---------|----------------|
| **`@pocket/bark`** | Multi-device Bark push + title presets |
| **`@pocket/daily`** | English (and later finance) notes: source → LLM → `notes/` → `site/` → calls bark |
| **`@pocket/cli`** | CLI router (`list` / `run` / `site` / `notify` / `bark`) |

**中文命令说明：** [docs/使用说明.md](docs/使用说明.md)

Daily pipeline:

```text
schedule → source → topic prompts → LLM → notes/*.md → site/*.html → Bark (title + teaser + Pages URL)
```

`@pocket/daily` depends on `@pocket/bark` only through `push()` / `resolveTitle()`. Bark never imports daily.

## Quick start

```bash
cp .env.example .env
# fill CURSOR_API_KEY + BARK_DEVICES / BARK_KEY_<alias>
# fill PAGES_BASE_URL=https://<user>.github.io/<repo>

npm install
npm run run:job -- --job english-morning --skip-delivery   # generate note + site
npm run site                                               # rebuild site/ only
npm run run:job -- --job english-morning                   # generate + Bark
npm run list
npm run bark -- --presets
```

## Layout

```text
packages/
  bark/     # push client
  daily/    # digest + GitHub Pages site builder
  cli/      # command entry
config/     # jobs.yaml + bark-presets.yaml
notes/      # generated markdown
site/       # generated HTML (gitignored; published to gh-pages)
```

## English workflow

1. Paste article text into `inbox/english.md` (Economist etc.), **or** leave it empty to use the BBC RSS fallback in `jobs.yaml`.
2. Run `english-morning`.
3. Note is saved to `notes/english/YYYY-MM-DD.md`.
4. HTML is built under `site/english/YYYY-MM-DD.html`.
5. Bark receives a short teaser + link to GitHub Pages (when `PAGES_BASE_URL` is set).

## Switch LLM

Default is Cursor Cloud Agent:

```yaml
llm:
  provider: cursor-cloud-agent
  model: default
```

Later, if you add a vendor API:

```yaml
llm:
  provider: openai-compatible   # DeepSeek / OpenAI / ...
  model: deepseek-chat
```

Env vars are listed in `.env.example`.

## Enable finance later

1. Set `finance-brief.enabled: true` in `config/jobs.yaml`.
2. Adjust `source.rssUrl` / inbox path.
3. Run: `npm run run:job -- --job finance-brief`.

## GitHub Actions + Pages

Workflow: `.github/workflows/daily.yml`

1. Generate note (`--skip-delivery`)
2. Build `site/`
3. Commit `notes/`
4. Deploy `site/` → `gh-pages`
5. Bark `notify` with Pages URL

One-time GitHub setup:

1. **Settings → Pages → Source**: Deploy from branch `gh-pages` / `/ (root)`
2. Repo must be **public** on free GitHub for Pages
3. Secrets: `CURSOR_API_KEY`, `BARK_DEVICES`, `BARK_KEY_daj`, `BARK_KEY_lzx`, …

Public URL (this repo): `https://mangomaster13.github.io/daily-sub/`

## Bark presets & multi-device

Title presets live in `config/bark-presets.yaml`:

```bash
npm run bark -- --presets
npm run bark -- --to daj --preset stranger --body "在吗"
npm run bark -- --to lzx --preset english --body "今日笔记已生成" --url "https://mangomaster13.github.io/daily-sub/english/2026-07-26.html"
npm run bark -- --to all --title "自定义标题" --body "test"
```

## Local button / Shortcut

```bash
npm run run:job -- --job english-morning
```

Wrap that command in macOS Shortcuts / Raycast / a Dock Automator app for one-click runs.

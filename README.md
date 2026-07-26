# daily-sub

Configurable daily digest pipeline:

```text
schedule → source → topic prompts → LLM → notes/*.md → Bark
```

Designed so you can swap LLM vendors and add topics (English today, finance later) without rewriting the core flow.

## Quick start

```bash
cp .env.example .env
# fill CURSOR_API_KEY + BARK_KEY (default LLM is Cursor Cloud Agent)

npm install
npm run run:job -- --job english-morning --skip-delivery   # generate note only
npm run run:job -- --job english-morning                   # generate + Bark
npm run list
```

## Architecture

| Layer | Role | Extend by |
|-------|------|-----------|
| `config/jobs.yaml` | Which jobs run, which source/topic/llm/delivery | Add a job block |
| `src/sources/` | inbox / RSS / inbox-or-rss | New `SourceProvider` |
| `src/topics/` | Prompt templates (`english-vocab`, `finance-brief`) | New topic module + registry |
| `src/providers/` | `openai-compatible`, `cursor-cloud-agent` | New `LlmProvider` |
| `src/delivery/` | Bark (or `none`) | New channel |
| `src/pipeline.ts` | Glue only — keep this thin | Prefer not to hardcode vendors |

## English workflow

1. Paste article text into `inbox/english.md` (Economist etc.), **or** leave it empty to use the BBC RSS fallback in `jobs.yaml`.
2. Run `english-morning`.
3. Note is saved to `notes/english/YYYY-MM-DD.md`.
4. Bark receives a short preview (full note stays in the repo).

## Switch LLM

Default is Cursor Cloud Agent:

```yaml
llm:
  provider: cursor-cloud-agent
  model: composer-2
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

## GitHub Actions

Workflow: `.github/workflows/daily.yml`

- Cron: `0 22 * * *` (UTC) ≈ Beijing **06:00**
- Manual run via Actions → “Daily digest”
- Secrets to configure: `CURSOR_API_KEY`, `BARK_KEY` (optional `BARK_SERVER`; add `LLM_*` only if you switch provider later)

Push timing tip: generation usually finishes in minutes. If you want a hard 08:00 push, split into two workflows later (generate at 06:00, push at 08:00). Current default pushes as soon as the note is ready.

## Local button / Shortcut

After notes exist (or as part of `run`):

```bash
npm run run:job -- --job english-morning
```

Wrap that command in macOS Shortcuts / Raycast / a Dock Automator app for one-click runs.

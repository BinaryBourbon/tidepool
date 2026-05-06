# Tidepool

Tidepool is the working environment where engineers and product managers plan, execute, and follow up on work — replacing the IDE as the primary surface for the full shipping cycle. Engineers describe changes as natural language prompts; coding agents make the changes and open pull requests automatically. The team reviews, iterates, merges, and follows up on metrics — without leaving Tidepool.

## Running locally

```bash
cp .env.example .env
# Set DATABASE_URL to a local Postgres connection string
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string. Injected automatically by Render from the linked `tidepool-db` instance. |
| `AOD_BASE_URL` | Base URL of the AoD (Agent on Demand) HTTP API. Default: `https://jake-bagzz.sprites.app`. |
| `AOD_TOKEN` | Bearer token for AoD API. **Secret** — set in Render dashboard only (`sync: false`). Never commit this value. |
| `AOD_AGENT_ID` | ID of the AoD agent dispatched for coding tasks. v0 default: the `general-purpose-engineer` agent ID. Future: user-managed. |
| `GITHUB_TOKEN` | GitHub API token for Tidepool-side operations (branch creation, diff fetch, PR merge). |
| `POSTHOG_TOKEN` | PostHog API token for funnel metrics and feature flag control. |
| `HONEYCOMB_KEY` | Honeycomb API key for error rate and latency signals. |

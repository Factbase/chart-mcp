# Factbase Charts

MCP App that renders interactive Chart.js charts inline in Claude's UI. Works with Claude Desktop, ChatGPT, VS Code, Cursor, and any client that supports MCP Apps.

**Live instance:** [mcp.factbase.org](https://mcp.factbase.org/mcp)

## Features

- 9 chart types: bar, line, area, pie, doughnut, polarArea, bubble, scatter, radar
- Stacked and horizontal bar chart variants
- Multi-chart dashboard grids (up to 4 columns)
- Custom colors or automatic 12-color palette
- Client-side rendering — chart data never stored server-side
- Works with any MCP-compatible client (Claude Desktop, ChatGPT, VS Code, Cursor)

## Tools

- **`render_chart`** — Render a single chart (bar, line, area, pie, doughnut, polarArea, bubble, scatter, radar, stacked)
- **`render_dashboard`** — Render a multi-chart grid layout

## Quick Start

Add Factbase Charts to Claude Desktop via **Settings > Connectors > Add custom connector**:

```
https://mcp.factbase.org/mcp
```

Or use `mcp-remote` (requires Node.js):

```json
{
  "mcpServers": {
    "factbase-charts": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.factbase.org/mcp"]
    }
  }
}
```

## Usage Examples

### 1. Bar chart

**Prompt:** "Create a bar chart of quarterly revenue: Q1 $50k, Q2 $80k, Q3 $120k, Q4 $95k"

Claude calls `render_chart` with:

```json
{
  "type": "bar",
  "title": "Quarterly Revenue",
  "data": {
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "datasets": [{ "label": "Revenue ($k)", "data": [50, 80, 120, 95] }]
  }
}
```

An interactive bar chart renders inline in the conversation.

### 2. Pie chart

**Prompt:** "Show browser market share as a pie chart: Chrome 65%, Safari 19%, Firefox 8%, Edge 5%, Other 3%"

Claude calls `render_chart` with:

```json
{
  "type": "pie",
  "title": "Browser Market Share",
  "data": {
    "labels": ["Chrome", "Safari", "Firefox", "Edge", "Other"],
    "datasets": [{ "label": "Share", "data": [65, 19, 8, 5, 3] }]
  }
}
```

Each slice gets a distinct color from the built-in palette.

### 3. Multi-chart dashboard

**Prompt:** "Build a dashboard with monthly active users as a line chart and signups by channel as a bar chart"

Claude calls `render_dashboard` with:

```json
{
  "title": "Growth Dashboard",
  "charts": [
    {
      "type": "line",
      "title": "Monthly Active Users",
      "data": {
        "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        "datasets": [{ "label": "MAU", "data": [12000, 15000, 18000, 22000, 28000, 35000] }]
      }
    },
    {
      "type": "bar",
      "title": "Signups by Channel",
      "data": {
        "labels": ["Organic", "Referral", "Paid", "Social"],
        "datasets": [{ "label": "Signups", "data": [4500, 3200, 2800, 1500] }]
      }
    }
  ],
  "columns": 2
}
```

Both charts render side-by-side in a grid layout.

## Self-Hosting

Factbase Charts runs on Cloudflare Workers.

```bash
npm install
cp .dev.vars.example .dev.vars    # Configure secrets (optional)
npm run dev                        # Local dev server (port 8787 + sandbox on 3456)
npm run deploy                     # Deploy to Cloudflare Workers
```

You'll need to create your own KV namespace and D1 database — see comments in `wrangler.jsonc`.

## Development

```bash
npm run dev        # wrangler dev + sandbox dev server (localhost:3456)
npm run build      # Type-check (tsc --noEmit) + bundle UI
npm test           # Run all tests (vitest)
npm run test:watch # Watch mode
```

## Deploy to Cloudflare Workers

Runs as a Cloudflare Worker over **Streamable HTTP** (no stdio). The server is stateless, so no Durable Object is required.

### Connector URL

Register this in Claude.ai (**Settings → Connectors → Add custom connector**) or any MCP client. The path is **`/mcp`** (Streamable HTTP) — there is no `/sse` endpoint:

```
https://mcp.<your-domain>/mcp      # self-hosted
https://mcp.factbase.org/mcp       # this deployment
```

### Custom domain

`wrangler.jsonc` binds the domain via `routes` with `custom_domain: true`. Change the `pattern` to your domain before deploying — `wrangler deploy` provisions the custom domain (the zone must already be on your Cloudflare account).

### Secrets

Authentication is **off by default**: with no secrets set, the server runs unauthenticated. All secrets are optional and managed with `wrangler secret` — never bundled.

| Secret | Purpose | Required? |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client | Only to enable auth (all 3 together) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Only to enable auth |
| `COOKIE_ENCRYPTION_KEY` | Signs OAuth consent cookies (base64-encoded 32-byte key) | Only to enable auth |
| `SENTRY_DSN` | Error monitoring | Optional |

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY
wrangler secret put SENTRY_DSN
```

For local development, copy `.dev.vars.example` → `.dev.vars` (git-ignored) instead of using `wrangler secret`.

### Test locally

```bash
npm install
wrangler dev                       # http://localhost:8787

# In a second terminal, point the MCP Inspector at the local endpoint:
npx @modelcontextprotocol/inspector
#   Transport: Streamable HTTP
#   URL:       http://localhost:8787/mcp
```

### Verify and deploy

```bash
npx wrangler deploy --dry-run      # bundle + validate, no deploy
npm run deploy                     # wrangler deploy
```

## Architecture

Claude tool calls flow through a thin MCP server that validates input and returns `structuredContent`. The browser-side UI transforms input into Chart.js configs and renders to canvas. All shared logic (types, validation, colors, config) lives in `shared/`.

```
Claude tool call → server.ts (validate) → structuredContent
    → mcp-app.ts (browser) → buildChartConfig() → Chart.js canvas
```

## Privacy

Factbase Charts logs only request metadata (chart type, title, timestamp). Chart data values are never stored. Charts render entirely client-side in your browser. Full policy: [factbase.org/privacy](https://factbase.org/privacy)

## Support

- GitHub Issues: [github.com/factbase-org/factbase-charts/issues](https://github.com/factbase-org/factbase-charts/issues)
- Email: [support@factbase.org](mailto:support@factbase.org)

## License

MIT

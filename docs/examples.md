# Examples

Ready-to-run examples for the two Factbase Charts tools: `render_chart` (single chart) and `render_dashboard` (multi-chart grid).

## How to run them

- **Fastest — the `chart_examples` prompt** — in Claude.ai, open the connector's prompt picker and choose **Chart examples**. It renders the whole gallery (6 charts + a dashboard) in one shot. This prompt is built into the server.
- **In Claude.ai** — register the connector (**Settings → Connectors → Add custom connector** → `https://mcp.factbase.org/mcp`), then type any prompt below. The chart renders inline.
- **In MCP Inspector** — `npx @modelcontextprotocol/inspector`, connect to `https://mcp.factbase.org/mcp` (Transport: Streamable HTTP), pick a tool, and paste the JSON into the `arguments` field.
- **Via curl** — see [Running with curl](#running-with-curl) at the bottom. curl returns JSON (`content` + `structuredContent`), not a rendered image — rendering only happens in a UI client.

## Validation rules

- Valid `type` values: `bar`, `line`, `area`, `pie`, `doughnut`, `polarArea`, `bubble`, `scatter`, `radar`.
- `scatter` data points must be `{x, y}`.
- `bubble` data points must be `{x, y, r}` (`r` = bubble radius).
- `pie` / `doughnut` / `polarArea` accept exactly **one** dataset.
- `area` is rendered as a filled `line` chart.
- Bar charts support `"stacked": true` and `"horizontal": true`.
- Dashboards take up to **4** `columns`.

---

## `render_chart`

### Prompts (type these in Claude)

1. **Bar** — "Bar chart of quarterly revenue: Q1 $50k, Q2 $80k, Q3 $120k, Q4 $95k."
2. **Stacked bar** — "Stacked bar chart of expenses by quarter — Salaries [40,42,45,47], Marketing [10,15,12,20], Ops [8,9,9,11] across Q1–Q4."
3. **Line** — "Line chart of monthly active users Jan–Jun: 12k, 15k, 18k, 22k, 28k, 35k."
4. **Pie** — "Pie chart of browser market share: Chrome 65, Safari 19, Firefox 8, Edge 5, Other 3."
5. **Radar** — "Radar chart comparing two laptops on Speed, Battery, Price, Weight, Screen (0–10)."
6. **Scatter** — "Scatter plot of ad spend vs. signups for 6 campaigns."

### Raw `arguments` JSON

```json
// bar — add "stacked": true or "horizontal": true to vary
{ "type": "bar", "title": "Quarterly Revenue",
  "data": { "labels": ["Q1","Q2","Q3","Q4"],
    "datasets": [{ "label": "Revenue ($k)", "data": [50,80,120,95] }] } }
```
```json
// stacked bar
{ "type": "bar", "title": "Expenses by Quarter", "stacked": true,
  "data": { "labels": ["Q1","Q2","Q3","Q4"],
    "datasets": [
      { "label": "Salaries", "data": [40,42,45,47] },
      { "label": "Marketing", "data": [10,15,12,20] },
      { "label": "Ops", "data": [8,9,9,11] } ] } }
```
```json
// line
{ "type": "line", "title": "Monthly Active Users",
  "data": { "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
    "datasets": [{ "label": "MAU", "data": [12000,15000,18000,22000,28000,35000] }] } }
```
```json
// area (mapped to line + fill internally)
{ "type": "area", "title": "Cumulative Signups",
  "data": { "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
    "datasets": [{ "label": "Signups", "data": [200,540,910,1430,2100,2950] }] } }
```
```json
// pie — exactly one dataset
{ "type": "pie", "title": "Browser Market Share",
  "data": { "labels": ["Chrome","Safari","Firefox","Edge","Other"],
    "datasets": [{ "label": "Share", "data": [65,19,8,5,3] }] } }
```
```json
// doughnut — exactly one dataset
{ "type": "doughnut", "title": "Plan Mix",
  "data": { "labels": ["Free","Pro","Team","Enterprise"],
    "datasets": [{ "label": "Users", "data": [5000,1800,600,120] }] } }
```
```json
// polarArea — exactly one dataset
{ "type": "polarArea", "title": "Traffic by Source",
  "data": { "labels": ["Direct","Search","Social","Email","Referral"],
    "datasets": [{ "label": "Visits", "data": [320,540,210,150,90] }] } }
```
```json
// radar — multiple datasets compare well
{ "type": "radar", "title": "Laptop Comparison",
  "data": { "labels": ["Speed","Battery","Price","Weight","Screen"],
    "datasets": [
      { "label": "Model A", "data": [8,6,7,9,8] },
      { "label": "Model B", "data": [6,9,8,7,6] } ] } }
```
```json
// scatter — points MUST be {x, y}
{ "type": "scatter", "title": "Ad Spend vs Signups",
  "data": { "labels": ["Campaigns"],
    "datasets": [{ "label": "Campaigns",
      "data": [{"x":200,"y":18},{"x":450,"y":34},{"x":600,"y":40},{"x":800,"y":55},{"x":1100,"y":62},{"x":1500,"y":81}] }] } }
```
```json
// bubble — points MUST be {x, y, r} (r = radius)
{ "type": "bubble", "title": "Markets: size vs growth",
  "data": { "labels": ["Markets"],
    "datasets": [{ "label": "Regions",
      "data": [{"x":20,"y":30,"r":15},{"x":40,"y":10,"r":8},{"x":60,"y":45,"r":22}] }] } }
```

---

## `render_dashboard`

### Prompts (type these in Claude)

1. "Dashboard with MAU as a line chart and signups by channel as a bar chart, 2 columns."
2. "Build a sales dashboard: a pie of revenue by region, a bar of top 5 products, and a line of monthly trend — 3 across."

### Raw `arguments` JSON

```json
{ "title": "Growth Dashboard", "columns": 2,
  "charts": [
    { "type": "line", "title": "Monthly Active Users",
      "data": { "labels": ["Jan","Feb","Mar","Apr","May","Jun"],
        "datasets": [{ "label": "MAU", "data": [12000,15000,18000,22000,28000,35000] }] } },
    { "type": "bar", "title": "Signups by Channel",
      "data": { "labels": ["Organic","Referral","Paid","Social"],
        "datasets": [{ "label": "Signups", "data": [4500,3200,2800,1500] }] } },
    { "type": "pie", "title": "Revenue by Region",
      "data": { "labels": ["NA","EU","APAC","LATAM"],
        "datasets": [{ "label": "Revenue", "data": [120,90,60,30] }] } },
    { "type": "doughnut", "title": "Plan Mix",
      "data": { "labels": ["Free","Pro","Team","Enterprise"],
        "datasets": [{ "label": "Users", "data": [5000,1800,600,120] }] } }
  ] }
```

---

## Running with curl

Streamable HTTP requires an `initialize` handshake first, then a `tools/call`. The server is stateless, so no session id is needed:

```bash
URL=https://mcp.factbase.org/mcp
HDR=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

curl -sS "$URL" "${HDR[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' >/dev/null

curl -sS "$URL" "${HDR[@]}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"render_chart","arguments":{"type":"bar","title":"Quarterly Revenue","data":{"labels":["Q1","Q2","Q3","Q4"],"datasets":[{"label":"Revenue ($k)","data":[50,80,120,95]}]}}}}' \
  | sed -n 's/^data: //p'
```

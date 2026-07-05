import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { ChartInputSchema, DashboardInputSchema } from "./shared/types.js";
import type { ChartInput, RenderResult } from "./shared/types.js";
import { validateChartInput, validateDashboardInput } from "./shared/validation.js";
import { calculateColumns } from "./shared/grid.js";

// The UI resource URI carries a per-deploy version tag (built in createServer)
// so hosts that cache the app resource by URI fetch the fresh bundle after a deploy.

// Example payloads surfaced by the `chart_examples` prompt (a showcase gallery).
const EXAMPLE_CHARTS: unknown[] = [
  {
    type: "bar",
    title: "Quarterly Revenue",
    data: {
      labels: ["Q1", "Q2", "Q3", "Q4"],
      datasets: [{ label: "Revenue ($k)", data: [50, 80, 120, 95] }],
    },
  },
  {
    type: "line",
    title: "Monthly Active Users",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      datasets: [{ label: "MAU", data: [12000, 15000, 18000, 22000, 28000, 35000] }],
    },
  },
  {
    type: "pie",
    title: "Browser Market Share",
    data: {
      labels: ["Chrome", "Safari", "Firefox", "Edge", "Other"],
      datasets: [{ label: "Share", data: [65, 19, 8, 5, 3] }],
    },
  },
  {
    type: "radar",
    title: "Laptop Comparison",
    data: {
      labels: ["Speed", "Battery", "Price", "Weight", "Screen"],
      datasets: [
        { label: "Model A", data: [8, 6, 7, 9, 8] },
        { label: "Model B", data: [6, 9, 8, 7, 6] },
      ],
    },
  },
  {
    type: "scatter",
    title: "Ad Spend vs Signups",
    data: {
      labels: ["Campaigns"],
      datasets: [
        {
          label: "Campaigns",
          data: [
            { x: 200, y: 18 }, { x: 450, y: 34 }, { x: 600, y: 40 },
            { x: 800, y: 55 }, { x: 1100, y: 62 }, { x: 1500, y: 81 },
          ],
        },
      ],
    },
  },
  {
    type: "bubble",
    title: "Markets: size vs growth",
    data: {
      labels: ["Markets"],
      datasets: [
        {
          label: "Regions",
          data: [
            { x: 20, y: 30, r: 15 }, { x: 40, y: 10, r: 8 }, { x: 60, y: 45, r: 22 },
          ],
        },
      ],
    },
  },
];

const EXAMPLE_DASHBOARD: unknown = {
  title: "Growth Dashboard",
  columns: 2,
  charts: [
    {
      type: "line",
      title: "Monthly Active Users",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [{ label: "MAU", data: [12000, 15000, 18000, 22000, 28000, 35000] }],
      },
    },
    {
      type: "bar",
      title: "Signups by Channel",
      data: {
        labels: ["Organic", "Referral", "Paid", "Social"],
        datasets: [{ label: "Signups", data: [4500, 3200, 2800, 1500] }],
      },
    },
    {
      type: "pie",
      title: "Revenue by Region",
      data: {
        labels: ["NA", "EU", "APAC", "LATAM"],
        datasets: [{ label: "Revenue", data: [120, 90, 60, 30] }],
      },
    },
    {
      type: "doughnut",
      title: "Plan Mix",
      data: {
        labels: ["Free", "Pro", "Team", "Enterprise"],
        datasets: [{ label: "Users", data: [5000, 1800, 600, 120] }],
      },
    },
  ],
};

export interface ServerOptions {
  htmlLoader: () => Promise<string>;
  onLog?: (entry: Record<string, unknown>) => void;
  userId?: string;
  /** Per-deploy tag baked into the UI resource URI to bust host-side caches. */
  resourceVersion?: string;
}

function createLogRequest(
  onLog?: (entry: Record<string, unknown>) => void,
  userId?: string,
) {
  return function logRequest(tool: string, data: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      tool,
      ...(userId && { userId }),
      ...data,
    };
    console.log(JSON.stringify(entry));
    onLog?.(entry);
  };
}

export function createServer(options: ServerOptions): McpServer {
  const logRequest = createLogRequest(options.onLog, options.userId);
  // Version tag → distinct URI per deploy so caching hosts refetch the bundle.
  const resourceUri = `ui://factbase-charts/mcp-app.${options.resourceVersion ?? "dev"}.html`;
  const server = new McpServer({
    name: "Factbase Charts",
    version: "1.0.0",
  });

  // Register render_chart tool
  registerAppTool(
    server,
    "render_chart",
    {
      title: "Render Chart",
      description:
        "Renders a single chart inline. Supports bar, line, area, pie, doughnut, polarArea, bubble, scatter, and radar chart types. Provide structured data with labels and datasets. Bubble charts require {x, y, r} data points where r is the bubble radius. `insight` is REQUIRED: read the actual data values and write a specific 10–15 word headline naming the key takeaway (trend, turning point, extreme, or comparison) — not a restatement of the title. `title` is the chart's formal name (shown as a lighter subheading). When the values are percentages, set `valueSuffix` to \"%\" so the axis shows the unit.",
      inputSchema: ChartInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: resourceUri } },
    },
    async (args) => {
      const validation = validateChartInput(args);
      if (!validation.success) {
        logRequest("render_chart", { status: "error", error: validation.error });
        return {
          content: [{ type: "text", text: `Validation error: ${validation.error}` }],
          isError: true,
        };
      }

      const input = validation.data;
      const dataPoints = input.data.datasets.reduce(
        (sum, ds) => sum + ds.data.length,
        0,
      );

      logRequest("render_chart", {
        status: "ok",
        chartType: input.type,
        title: input.title,
        datasets: input.data.datasets.length,
        dataPoints,
        stacked: input.stacked ?? false,
        horizontal: input.horizontal ?? false,
      });

      const structuredContent: RenderResult = {
        mode: "chart",
        chart: input,
      };

      return {
        content: [
          {
            type: "text",
            text: `Rendered ${input.type} chart: "${input.title}" with ${input.data.datasets.length} dataset(s) and ${dataPoints} data points.`,
          },
        ],
        structuredContent,
      };
    },
  );

  // Register render_dashboard tool
  registerAppTool(
    server,
    "render_dashboard",
    {
      title: "Render Dashboard",
      description:
        "Renders multiple charts in a grid layout. Each chart can be any supported type (bar, line, area, pie, doughnut, polarArea, bubble, scatter, radar). Each chart REQUIRES an `insight` (a specific 10–15 word takeaway read from its data, not the title) and a `title` (formal chart name); set `valueSuffix` to \"%\" on any chart whose values are percentages. Optionally specify the number of grid columns.",
      inputSchema: DashboardInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: resourceUri } },
    },
    async (args) => {
      const validation = validateDashboardInput(args);
      if (!validation.success) {
        logRequest("render_dashboard", { status: "error", error: validation.error });
        return {
          content: [{ type: "text", text: `Validation error: ${validation.error}` }],
          isError: true,
        };
      }

      const input = validation.data;
      const columns = calculateColumns(input.charts.length, input.columns);
      const chartTypes = input.charts.map((c: ChartInput) => c.type).join(", ");

      logRequest("render_dashboard", {
        status: "ok",
        title: input.title,
        chartCount: input.charts.length,
        chartTypes: input.charts.map((c: ChartInput) => c.type),
        columns,
      });

      const structuredContent: RenderResult = {
        mode: "dashboard",
        title: input.title,
        charts: input.charts,
        columns,
      };

      return {
        content: [
          {
            type: "text",
            text: `Rendered dashboard: "${input.title}" with ${input.charts.length} charts (${chartTypes}).`,
          },
        ],
        structuredContent,
      };
    },
  );

  // Register UI resource
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await options.htmlLoader();
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                permissions: { clipboardWrite: {} },
              },
            },
          },
        ],
      };
    },
  );

  // Register the `chart_examples` prompt — a user-invokable showcase that asks
  // the host model to render a gallery of charts via the tools above.
  server.registerPrompt(
    "chart_examples",
    {
      title: "Chart examples",
      description:
        "Render a gallery of example charts and a dashboard to showcase what Factbase Charts can do.",
    },
    () => {
      const lines = EXAMPLE_CHARTS.map(
        (chart, i) => `${i + 1}. render_chart — ${JSON.stringify(chart)}`,
      );
      lines.push(
        `${EXAMPLE_CHARTS.length + 1}. render_dashboard — ${JSON.stringify(EXAMPLE_DASHBOARD)}`,
      );
      const text = [
        "Show me a gallery of what Factbase Charts can do.",
        "Render each item below by calling the named tool exactly once with the given input — use render_chart for the charts and render_dashboard for the final one:",
        "",
        ...lines,
      ].join("\n");
      return {
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    },
  );

  return server;
}

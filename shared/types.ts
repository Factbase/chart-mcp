import { z } from "zod";

export const ChartTypeSchema = z.enum([
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "polarArea",
  "bubble",
  "scatter",
  "radar",
]);

export type ChartType = z.infer<typeof ChartTypeSchema>;

const ScatterPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  r: z.number().optional(),
});

export const DatasetSchema = z.object({
  label: z.string(),
  data: z.union([z.array(z.number()), z.array(ScatterPointSchema)]),
  color: z.string().optional(),
});

export type Dataset = z.infer<typeof DatasetSchema>;

export const ChartDataSchema = z.object({
  labels: z.array(z.string()).optional(),
  datasets: z.array(DatasetSchema).min(1),
});

export type ChartData = z.infer<typeof ChartDataSchema>;

export const ChartInputSchema = z.object({
  type: ChartTypeSchema,
  insight: z
    .string()
    .describe(
      "REQUIRED. Read the actual data values, then write a specific, insightful 10–15 word headline naming the key takeaway — the trend, turning point, extreme, or comparison the numbers show. Do NOT restate the title. Rendered bold above the chart.",
    )
    .optional(),
  title: z
    .string()
    .describe(
      'The formal name of the chart (e.g. "Quarterly Revenue, 2025"). Rendered as a lighter subheading below the insight.',
    ),
  data: ChartDataSchema,
  stacked: z.boolean().optional(),
  horizontal: z.boolean().optional(),
  colors: z.array(z.string()).optional(),
  valueSuffix: z
    .string()
    .describe(
      'Unit appended to the value-axis tick labels, e.g. "%" for percentages or "$" for currency. Set to "%" whenever the data are percentages.',
    )
    .optional(),
});

export type ChartInput = z.infer<typeof ChartInputSchema>;

export const DashboardInputSchema = z.object({
  title: z.string(),
  charts: z.array(ChartInputSchema).min(1),
  columns: z.number().int().min(1).max(4).optional(),
});

export type DashboardInput = z.infer<typeof DashboardInputSchema>;

export type RenderResult =
  | { mode: "chart"; chart: ChartInput }
  | { mode: "dashboard"; title: string; charts: ChartInput[]; columns: number };

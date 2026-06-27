import type { ChartType, Dataset } from "./types.js";

// GINC Palette — primary #6652ff
const PALETTE = [
  "#6652ff", // purple (primary)
  "#2ec2ff", // light blue
  "#37c43e", // green
  "#fdc103", // gold
  "#fa8205", // orange
  "#f80315", // red
  "#9b71e4", // lavender
];

export function getColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

export function assignColors(
  type: ChartType,
  datasets: Dataset[],
  chartColors?: string[],
): string[][] {
  if (type === "pie" || type === "doughnut" || type === "polarArea") {
    // For pie/doughnut: each slice gets a different color
    return datasets.map((ds) =>
      ds.data.map((_, i) => chartColors?.[i] ?? getColor(i)),
    );
  }

  // For all other types: each dataset gets one color
  // Priority: dataset color > chart colors > default palette
  return datasets.map((ds, i) => [ds.color ?? chartColors?.[i] ?? getColor(i)]);
}

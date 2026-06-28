import type { ChartConfiguration } from "chart.js";
import type { ChartInput } from "./types.js";
import { assignColors } from "./colors.js";

/** Append alpha to a hex color: "#4e79a7" + 0.15 → "rgba(78,121,167,0.15)" */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const GRID_COLOR = "#e5e7eb"; // light grey — horizontal gridlines
const AXIS_COLOR = "#4b5563"; // dark grey — axis line + tick labels
const LABEL_FONT_SIZE = 10; // px — in-chart label text (ticks, legend, tooltip)

export function buildChartConfig(input: ChartInput): ChartConfiguration {
  const { type, title, data, stacked, horizontal } = input;

  // Map our type to Chart.js type
  const chartJsType = type === "area" ? "line" : type;

  // Assign colors (custom colors override default palette)
  const colorSets = assignColors(type, data.datasets, input.colors);

  // Build Chart.js datasets
  const isRadar = type === "radar";
  const datasets = data.datasets.map((ds, i) => {
    const colors = colorSets[i];
    const isPieOrDoughnut = type === "pie" || type === "doughnut" || type === "polarArea";
    const isLineLike = type === "line" || type === "area";

    return {
      label: ds.label,
      data: ds.data,
      // Pie/doughnut: array of colors (per slice). Others: single color.
      backgroundColor: isPieOrDoughnut
        ? colors
        : isRadar
          ? hexAlpha(colors[0], 0.15)
          : type === "area"
            ? hexAlpha(colors[0], 0.2) // lighter fill under the line
            : colors[0],
      borderColor: isPieOrDoughnut ? colors : colors[0],
      // Radar: thin outlines, subtle fill, small points
      ...(isRadar
        ? { borderWidth: 2, pointRadius: 3, pointBackgroundColor: colors[0], fill: true }
        : {}),
      // Area chart: fill under the line
      ...(type === "area" ? { fill: true } : {}),
      // Line/area: smooth curves; hide data-point dots until hover
      ...(isLineLike
        ? { tension: 0.3, pointRadius: 0, pointHoverRadius: 4 }
        : {}),
    };
  });

  // Build scales (not applicable for pie/doughnut/radar)
  const noScales =
    type === "pie" || type === "doughnut" || type === "polarArea" || type === "radar";
  // Bar/line/area: show only horizontal gridlines (hide the vertical x gridlines).
  const horizontalGridOnly = type === "bar" || type === "line" || type === "area";
  // Axis spine (border line) visibility per type:
  //  - vertical bar / area → hide the vertical (y) axis line
  //  - horizontal bar      → hide the horizontal (x) axis line
  //  - scatter / bubble    → hide both axis lines
  const isHorizontalBar = type === "bar" && !!horizontal;
  const noAxisLines = type === "scatter" || type === "bubble";
  const xBorderDisplay = !(isHorizontalBar || noAxisLines);
  const yBorderDisplay = !(
    (type === "bar" && !horizontal) || type === "area" || noAxisLines
  );
  const scales = noScales
    ? undefined
    : {
        x: {
          ...(stacked ? { stacked: true } : {}),
          ...(type === "scatter" || type === "bubble" ? { type: "linear" as const } : {}),
          // Vertical gridlines off for bar/line/area; light grey elsewhere.
          grid: { display: !horizontalGridOnly, color: GRID_COLOR },
          border: { display: xBorderDisplay, color: AXIS_COLOR },
          ticks: { color: AXIS_COLOR, font: { size: LABEL_FONT_SIZE } },
        },
        y: {
          ...(stacked ? { stacked: true } : {}),
          ...(type === "bar" ? { beginAtZero: true } : {}),
          // Light grey horizontal gridlines.
          grid: { color: GRID_COLOR },
          border: { display: yBorderDisplay, color: AXIS_COLOR },
          ticks: { color: AXIS_COLOR, font: { size: LABEL_FONT_SIZE } },
        },
      };

  // Legend: hidden for single dataset (except pie/doughnut)
  const showLegend =
    type === "pie" || type === "doughnut" || type === "polarArea" || data.datasets.length > 1;

  const config: ChartConfiguration = {
    type: chartJsType as ChartConfiguration["type"],
    data: {
      ...(data.labels ? { labels: data.labels } : {}),
      datasets: datasets as ChartConfiguration["data"]["datasets"],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // No animations anywhere.
      animation: false,
      // Horizontal bar
      ...(horizontal ? { indexAxis: "y" as const } : {}),
      // Always surface a tooltip on hover, even when not exactly over a point.
      interaction: {
        mode: (horizontalGridOnly ? "index" : "nearest") as "index" | "nearest",
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: title,
        },
        legend: {
          display: showLegend,
          // Square, slightly-rounded color swatch before each label.
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            useBorderRadius: true,
            borderRadius: 3,
            font: { size: LABEL_FONT_SIZE },
          },
        },
        tooltip: {
          enabled: true,
          bodyFont: { size: LABEL_FONT_SIZE },
          titleFont: { size: LABEL_FONT_SIZE },
        },
      },
      ...(scales ? { scales } : {}),
      // Radar: cleaner scale
      ...(isRadar
        ? {
            scales: {
              r: {
                beginAtZero: true,
                ticks: { stepSize: 2, font: { size: LABEL_FONT_SIZE } },
                pointLabels: { font: { size: LABEL_FONT_SIZE } },
              },
            },
          }
        : {}),
    },
  };

  return config;
}

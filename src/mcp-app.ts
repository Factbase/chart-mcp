import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { Chart, registerables } from "chart.js";
import { buildChartConfig, hexAlpha } from "../shared/config.js";
import { getColor } from "../shared/colors.js";
import { calculateColumns } from "../shared/grid.js";
import type { RenderResult, ChartInput } from "../shared/types.js";

// Register all Chart.js components
Chart.register(...registerables);

const charts: Chart[] = [];
let lastResult: RenderResult | null = null;

// Static source attribution shown at the bottom of every chart/cell (for now).
const SOURCE_TEXT = "Source: Global Institute for National Capability, 2026";

const COLOR_PRESETS = [
  "#6652ff", "#2ec2ff", "#37c43e", "#fdc103",
  "#fa8205", "#f80315", "#9b71e4",
];

const cardTemplate = document.getElementById(
  "chart-card-template",
) as HTMLTemplateElement;
// Captured as a string so each card is parsed into a live, main-document <div>
// (avoids <template> content living in an inert document with no window, which
// makes Chart.js's getComputedStyle throw).
const CARD_HTML = cardTemplate.innerHTML;

function destroyAllCharts(): void {
  for (const chart of charts) chart.destroy();
  charts.length = 0;
}

function showElement(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "";
}

function hideElement(id: string): void {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

function syncChartDefaults(): void {
  const s = getComputedStyle(document.documentElement);
  const text = s.getPropertyValue("--color-text-primary").trim();
  const border = s.getPropertyValue("--color-border-secondary").trim();
  const font = s.getPropertyValue("--font-sans").trim();

  if (text) Chart.defaults.color = text;
  if (border) Chart.defaults.borderColor = border;
  if (font) Chart.defaults.font.family = font;
}

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  syncChartDefaults();
  if (lastResult) handleResult(lastResult);
}

function showError(container: HTMLElement | null, message: string): void {
  if (!container) return;
  const el = document.createElement("div");
  el.className = "chart-error";
  el.textContent = message;
  container.appendChild(el);
}

/** Effective color for dataset i (custom > chart-level colors > palette). */
function getDatasetColor(input: ChartInput, i: number): string {
  return input.data.datasets[i].color ?? input.colors?.[i] ?? getColor(i);
}

// ── Chart card ─────────────────────────────────────────────────
// A self-contained artifact — insight + formal name + toolbar + canvas +
// source — used for the single-chart view and for every dashboard cell.

function mountChartCard(parent: HTMLElement, input: ChartInput): void {
  // Parse the card markup into a fresh main-document element.
  const holder = document.createElement("div");
  holder.innerHTML = CARD_HTML;
  const card = holder.firstElementChild as HTMLElement;

  // Header: bold insight (10–15 word takeaway) + non-bold formal chart name.
  const insightEl = card.querySelector(".chart-insight") as HTMLElement;
  const nameEl = card.querySelector(".chart-name") as HTMLElement;
  insightEl.textContent = input.insight ?? input.title;
  // Show the formal name only when a distinct insight is present.
  nameEl.textContent = input.insight ? input.title : "";
  nameEl.style.display = input.insight ? "" : "none";

  // Source attribution.
  (card.querySelector(".chart-source") as HTMLElement).textContent = SOURCE_TEXT;

  // Attach BEFORE creating the chart so the canvas is live (has a window and
  // layout) — otherwise Chart.js measurement throws.
  parent.appendChild(card);

  // Render the chart (Chart.js built-in title suppressed — the DOM header is
  // the heading).
  const canvas = card.querySelector("canvas") as HTMLCanvasElement;
  let chart: Chart | null = null;
  try {
    const config = buildChartConfig(input);
    if (config.options?.plugins?.title) {
      config.options.plugins.title.display = false;
    }
    chart = new Chart(canvas, config);
    charts.push(chart);
  } catch (err) {
    console.error("Chart render error:", err);
    canvas.style.display = "none";
    showError(
      card.querySelector(".chart-canvas-wrap"),
      err instanceof Error ? err.message : "Failed to render chart",
    );
  }

  wireColors(card, input, chart);
  wireCopyCsv(card, input);
  wireCopyImage(card, chart);
}

// ── Toolbar: copy image ────────────────────────────────────────

function flashCheck(btn: HTMLElement, mainSelector: string): void {
  const main = btn.querySelector(mainSelector) as HTMLElement | null;
  const check = btn.querySelector(".icon-check") as HTMLElement | null;
  if (main) main.style.display = "none";
  if (check) check.style.display = "";
  btn.classList.add("copied");
  setTimeout(() => {
    if (main) main.style.display = "";
    if (check) check.style.display = "none";
    btn.classList.remove("copied");
  }, 1500);
}

function wireCopyImage(card: HTMLElement, chart: Chart | null): void {
  const btn = card.querySelector(".btn-download") as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!chart) return;
    chart.canvas.toBlob((blob) => {
      if (!blob) return;
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => flashCheck(btn, ".icon-image"));
    }, "image/png");
  });
}

// ── Toolbar: copy data as CSV ──────────────────────────────────

function buildCsv(input: ChartInput): string {
  const { data, type } = input;
  const isPointBased = type === "scatter" || type === "bubble";

  if (isPointBased) {
    const isBubble = type === "bubble";
    const headers = data.datasets.flatMap((ds) =>
      isBubble
        ? [`${ds.label}_x`, `${ds.label}_y`, `${ds.label}_r`]
        : [`${ds.label}_x`, `${ds.label}_y`],
    );
    const maxLen = Math.max(...data.datasets.map((ds) => ds.data.length));
    const rows = [headers.join(",")];
    for (let i = 0; i < maxLen; i++) {
      const cells = data.datasets.flatMap((ds) => {
        const pt = ds.data[i] as { x: number; y: number; r?: number } | undefined;
        if (!pt) return isBubble ? ["", "", ""] : ["", ""];
        return isBubble
          ? [String(pt.x), String(pt.y), String(pt.r ?? "")]
          : [String(pt.x), String(pt.y)];
      });
      rows.push(cells.join(","));
    }
    return rows.join("\n");
  }

  const headers = ["Label", ...data.datasets.map((ds) => ds.label)];
  const labels = data.labels ?? data.datasets[0].data.map((_, i) => String(i + 1));
  const rows = [headers.join(",")];
  for (let i = 0; i < labels.length; i++) {
    const cells = [labels[i], ...data.datasets.map((ds) => ds.data[i] ?? "")];
    rows.push(cells.join(","));
  }
  return rows.join("\n");
}

function wireCopyCsv(card: HTMLElement, input: ChartInput): void {
  const btn = card.querySelector(".btn-copy") as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener("click", () => {
    navigator.clipboard
      .writeText(buildCsv(input))
      .then(() => flashCheck(btn, ".icon-copy"));
  });
}

// ── Toolbar: color popover ─────────────────────────────────────

/** Apply a color change to dataset i and live-update the chart. */
function applyColorChange(
  input: ChartInput,
  chart: Chart,
  i: number,
  hex: string,
): void {
  // Persist into the input so re-renders keep the color.
  input.data.datasets[i].color = hex;

  const ds = chart.data.datasets[i];
  const isRadar = input.type === "radar";
  const isArea = input.type === "area";
  const isPie = input.type === "pie" || input.type === "doughnut";

  if (isPie) return; // per-slice colors not supported here

  ds.borderColor = hex;
  ds.backgroundColor = isRadar
    ? hexAlpha(hex, 0.15)
    : isArea
      ? hexAlpha(hex, 0.2)
      : hex;
  if (isRadar) {
    (ds as unknown as Record<string, unknown>).pointBackgroundColor = hex;
  }
  chart.update();
}

function createChevronSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("color-row-chevron");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4.5 2.5l3.5 3.5-3.5 3.5");
  svg.appendChild(path);
  return svg;
}

function expandPopoverRow(popover: HTMLElement, rowIndex: number): void {
  const pickers = popover.querySelectorAll(".color-picker");
  const chevrons = popover.querySelectorAll(".color-row-chevron");
  const p = pickers[rowIndex] as HTMLElement | undefined;
  const c = chevrons[rowIndex] as HTMLElement | undefined;
  if (p) p.style.display = "";
  if (c) c.classList.add("expanded");
}

function buildColorPopover(
  popover: HTMLElement,
  input: ChartInput,
  chart: Chart,
): void {
  while (popover.firstChild) popover.removeChild(popover.firstChild);

  const header = document.createElement("div");
  header.className = "color-popover-header";
  header.textContent = "Colors";
  popover.appendChild(header);

  input.data.datasets.forEach((ds, i) => {
    const currentColor = getDatasetColor(input, i);

    if (i > 0) {
      const divider = document.createElement("div");
      divider.className = "color-popover-divider";
      popover.appendChild(divider);
    }

    const rowHeader = document.createElement("div");
    rowHeader.className = "color-row-header";

    const name = document.createElement("span");
    name.className = "color-row-name";
    name.textContent = ds.label;

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = currentColor;

    const chevron = createChevronSvg();

    rowHeader.appendChild(name);
    rowHeader.appendChild(dot);
    rowHeader.appendChild(chevron);

    const picker = document.createElement("div");
    picker.className = "color-picker";
    picker.style.display = "none";

    const grid = document.createElement("div");
    grid.className = "color-preset-grid";

    for (const preset of COLOR_PRESETS) {
      const swatch = document.createElement("button");
      swatch.className = "color-preset";
      swatch.style.background = preset;

      if (preset === currentColor) {
        const check = document.createElement("span");
        check.className = "color-preset-check";
        check.textContent = "✓";
        swatch.appendChild(check);
      }

      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        applyColorChange(input, chart, i, preset);
        buildColorPopover(popover, input, chart);
        expandPopoverRow(popover, i);
      });

      grid.appendChild(swatch);
    }
    picker.appendChild(grid);

    const hexRow = document.createElement("div");
    hexRow.className = "color-hex-row";

    const hashLabel = document.createElement("span");
    hashLabel.className = "color-hex-hash";
    hashLabel.textContent = "#";

    const hexInput = document.createElement("input");
    hexInput.className = "color-hex-input";
    hexInput.type = "text";
    hexInput.maxLength = 6;
    hexInput.value = currentColor.replace("#", "").toUpperCase();
    hexInput.spellcheck = false;

    hexInput.addEventListener("input", () => {
      const val = hexInput.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
      hexInput.value = val;
      if (val.length === 6) {
        const hex = `#${val.toLowerCase()}`;
        applyColorChange(input, chart, i, hex);
        dot.style.background = hex;
        grid.querySelectorAll(".color-preset-check").forEach((c) => c.remove());
      }
    });

    hexInput.addEventListener("click", (e) => e.stopPropagation());

    hexRow.appendChild(hashLabel);
    hexRow.appendChild(hexInput);
    picker.appendChild(hexRow);

    popover.appendChild(rowHeader);
    popover.appendChild(picker);

    rowHeader.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = picker.style.display !== "none";
      picker.style.display = isOpen ? "none" : "";
      chevron.classList.toggle("expanded", !isOpen);
    });
  });
}

function wireColors(
  card: HTMLElement,
  input: ChartInput,
  chart: Chart | null,
): void {
  const btn = card.querySelector(".btn-colors") as HTMLElement | null;
  const popover = card.querySelector(".color-popover") as HTMLElement | null;
  if (!btn || !popover) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!chart) return;
    const isOpen = popover.style.display !== "none";
    // Close any other open popovers first.
    closeAllPopovers();
    if (!isOpen) {
      buildColorPopover(popover, input, chart);
      popover.style.display = "";
      btn.classList.add("active");
    }
  });

  popover.addEventListener("click", (e) => e.stopPropagation());
}

function closeAllPopovers(): void {
  document.querySelectorAll(".color-popover").forEach((p) => {
    (p as HTMLElement).style.display = "none";
  });
  document.querySelectorAll(".btn-colors.active").forEach((b) => {
    b.classList.remove("active");
  });
}

// Close any open color popover when clicking outside of it.
document.addEventListener("click", () => closeAllPopovers());

// ── Result handling ────────────────────────────────────────────

function showChart(input: ChartInput): void {
  hideElement("loading");
  hideElement("dashboard-container");

  const container = document.getElementById("chart-container")!;
  while (container.firstChild) container.removeChild(container.firstChild);
  showElement("chart-container");
  mountChartCard(container, input);
}

function showDashboard(
  title: string,
  chartInputs: ChartInput[],
  columns: number,
): void {
  hideElement("loading");
  hideElement("chart-container");
  showElement("dashboard-container");

  const titleEl = document.getElementById("dashboard-title")!;
  titleEl.textContent = title;

  const grid = document.getElementById("dashboard-grid")!;
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  const cols = calculateColumns(chartInputs.length, columns);
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (const input of chartInputs) {
    const cell = document.createElement("div");
    cell.className = "dashboard-cell";
    grid.appendChild(cell);
    mountChartCard(cell, input);
  }
}

function handleResult(result: RenderResult): void {
  lastResult = result;
  destroyAllCharts();

  try {
    if (result.mode === "chart") {
      showChart(result.chart);
    } else if (result.mode === "dashboard") {
      showDashboard(result.title, result.charts, result.columns);
    }
  } catch (err) {
    console.error("Render error:", err);
    hideElement("loading");
    const container =
      document.getElementById("chart-container") ||
      document.getElementById("dashboard-container");
    showElement(container?.id ?? "chart-container");
    showError(container, err instanceof Error ? err.message : "Failed to render");
  }
}

// ── MCP App lifecycle ──────────────────────────────────────────

const app = new App(
  { name: "Factbase Charts", version: "1.0.0" },
  {},
  { autoResize: true },
);

app.ontoolresult = (result) => {
  try {
    const structured = result.structuredContent as RenderResult | undefined;
    if (structured) {
      handleResult(structured);
    }
  } catch (err) {
    console.error("Tool result error:", err);
    hideElement("loading");
    showElement("chart-container");
    showError(
      document.getElementById("chart-container"),
      err instanceof Error ? err.message : "Failed to process tool result",
    );
  }
};

app.ontoolinput = () => {
  // Show loading state while tool is executing
  hideElement("chart-container");
  hideElement("dashboard-container");
  showElement("loading");
  const loadingEl = document.getElementById("loading");
  if (loadingEl) loadingEl.textContent = "Rendering chart...";
};

app.onhostcontextchanged = (ctx) => {
  applyHostContext(ctx);
};

await app.connect();
const initialCtx = app.getHostContext();
if (initialCtx) applyHostContext(initialCtx);

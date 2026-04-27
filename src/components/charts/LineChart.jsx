import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useTheme } from "../../context/ThemeContext";

const DEFAULT_HEIGHT = 256;
const DEFAULT_LINE_COLOR = "#6366f1";

const DEFAULT_TOOLTIP_STYLE = {
  borderRadius: 12,
  borderColor: "#e2e8f0",
  fontSize: "12px",
  boxShadow: "0 12px 24px -12px rgba(15, 23, 42, 0.25)",
};

const resolveHeight = (height) => {
  if (typeof height === "number" && Number.isFinite(height)) return `${height}px`;
  if (typeof height === "string" && height.trim() !== "") return height;
  return `${DEFAULT_HEIGHT}px`;
};

const normalizeValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasData = (data) => Array.isArray(data) && data.length > 0;

export default function LineChart({
  data = [],
  lines,
  height = DEFAULT_HEIGHT,
  xKey = "name",
  yAxisWidth = 28,
  showLegend = true,
  emptyLabel = "No data yet.",
  tooltipStyle = DEFAULT_TOOLTIP_STYLE,
}) {
  const { isDarkMode } = useTheme();

  const lineDefs = Array.isArray(lines) && lines.length
    ? lines
    : [{ dataKey: "value", name: "Value", color: DEFAULT_LINE_COLOR }];

  const categories = useMemo(
    () => data.map((item) => String(item?.[xKey] ?? "")),
    [data, xKey]
  );
  const series = useMemo(
    () => lineDefs.map((line) => ({
      name: line.name || line.dataKey || "Value",
      data: data.map((item) => normalizeValue(item?.[line.dataKey])),
    })),
    [data, lineDefs]
  );
  const strokeColors = useMemo(
    () => lineDefs.map((line) => line.color || DEFAULT_LINE_COLOR),
    [lineDefs]
  );

  const options = useMemo(() => ({
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 720,
        animateGradually: { enabled: true, delay: 120 },
        dynamicAnimation: { enabled: true, speed: 360 },
      },
      fontFamily: "inherit",
    },
    colors: strokeColors,
    stroke: {
      curve: "smooth",
      width: 3,
      lineCap: "round",
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 0.2,
        opacityFrom: 0.35,
        opacityTo: 0.06,
        stops: [0, 90, 100],
      },
    },
    markers: {
      size: 0,
      strokeWidth: 0,
      hover: {
        size: 5,
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      padding: { top: 6, right: 8, bottom: 0, left: 8 },
    },
    legend: {
      show: showLegend,
      position: "bottom",
      labels: {
        colors: isDarkMode ? "#e2e8f0" : "#334155",
      },
      markers: {
        width: 10,
        height: 10,
        radius: 10,
      },
    },
    tooltip: {
      theme: isDarkMode ? "dark" : "light",
      shared: true,
      intersect: false,
      style: {
        fontSize: tooltipStyle?.fontSize || DEFAULT_TOOLTIP_STYLE.fontSize,
      },
      y: {
        formatter: (value) => `${Math.round(normalizeValue(value))}`,
      },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: isDarkMode ? "#cbd5e1" : "#475569",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      min: 0,
      decimalsInFloat: 0,
      labels: {
        minWidth: yAxisWidth,
        maxWidth: Math.max(yAxisWidth, 40),
        style: {
          colors: isDarkMode ? "#94a3b8" : "#64748b",
          fontSize: "12px",
        },
        formatter: (value) => `${Math.round(normalizeValue(value))}`,
      },
    },
  }), [categories, isDarkMode, showLegend, strokeColors, tooltipStyle, yAxisWidth]);

  if (!hasData(data)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: resolveHeight(height) }}>
      <ReactApexChart
        type="line"
        options={options}
        series={series}
        height="100%"
        width="100%"
      />
    </div>
  );
}

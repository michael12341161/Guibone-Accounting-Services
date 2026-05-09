import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useTheme } from "../../context/ThemeContext";

const DEFAULT_HEIGHT = 256;
const DEFAULT_COLOR = "#94a3b8";

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

const resolveColumnWidth = (barSize) => {
  if (typeof barSize !== "number" || !Number.isFinite(barSize)) return "52%";
  const width = Math.round((barSize / 64) * 100);
  return `${Math.max(28, Math.min(78, width))}%`;
};

const hasData = (data) => Array.isArray(data) && data.some((item) => normalizeValue(item?.value) > 0);

export default function Barchart({
  data = [],
  colors = {},
  height = DEFAULT_HEIGHT,
  barSize = 36,
  yAxisWidth = 28,
  emptyLabel = "No data yet.",
  tooltipStyle = DEFAULT_TOOLTIP_STYLE,
}) {
  const { isDarkMode } = useTheme();

  const categories = useMemo(
    () => data.map((item) => String(item?.name ?? "")),
    [data]
  );
  const seriesData = useMemo(
    () => data.map((item) => normalizeValue(item?.value)),
    [data]
  );
  const seriesColors = useMemo(
    () => data.map((item) => colors?.[item?.name] ?? colors?.Other ?? DEFAULT_COLOR),
    [colors, data]
  );

  const options = useMemo(() => ({
    chart: {
      type: "bar",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 700,
        animateGradually: { enabled: true, delay: 80 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
      fontFamily: "inherit",
    },
    colors: seriesColors,
    dataLabels: { enabled: false },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
    grid: {
      borderColor: isDarkMode ? "#334155" : "#e2e8f0",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      padding: { top: 6, right: 8, bottom: 0, left: 8 },
    },
    plotOptions: {
      bar: {
        distributed: true,
        borderRadius: 10,
        borderRadiusApplication: "end",
        columnWidth: resolveColumnWidth(barSize),
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
      forceNiceScale: true,
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
    tooltip: {
      theme: isDarkMode ? "dark" : "light",
      style: {
        fontSize: tooltipStyle?.fontSize || DEFAULT_TOOLTIP_STYLE.fontSize,
      },
      y: {
        formatter: (value) => `${Math.round(normalizeValue(value))}`,
      },
    },
    legend: { show: false },
  }), [barSize, categories, isDarkMode, seriesColors, tooltipStyle, yAxisWidth]);

  const series = useMemo(
    () => [{ name: "Value", data: seriesData }],
    [seriesData]
  );

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
        type="bar"
        options={options}
        series={series}
        height="100%"
        width="100%"
      />
    </div>
  );
}

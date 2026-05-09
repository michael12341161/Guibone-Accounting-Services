import React, { useMemo } from "react";
import ReactApexChart from "react-apexcharts";
import { useTheme } from "../../context/ThemeContext";

const DEFAULT_HEIGHT = 256;
const DEFAULT_COLOR = "#94a3b8";
const DEFAULT_INNER_RADIUS = 55;
const DEFAULT_OUTER_RADIUS = 85;

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

const resolveDonutSize = (innerRadius, outerRadius) => {
  if (
    typeof innerRadius === "number" &&
    Number.isFinite(innerRadius) &&
    typeof outerRadius === "number" &&
    Number.isFinite(outerRadius) &&
    outerRadius > 0
  ) {
    const ratio = Math.round((innerRadius / outerRadius) * 100);
    return `${Math.max(35, Math.min(82, ratio))}%`;
  }

  return `${Math.round((DEFAULT_INNER_RADIUS / DEFAULT_OUTER_RADIUS) * 100)}%`;
};

const resolvePieScale = (outerRadius) => {
  if (typeof outerRadius !== "number" || !Number.isFinite(outerRadius)) return 0.92;
  const scale = outerRadius / DEFAULT_OUTER_RADIUS;
  return Math.max(0.72, Math.min(1.08, Number(scale.toFixed(2))));
};

const hasData = (data) => Array.isArray(data) && data.some((item) => normalizeValue(item?.value) > 0);

export default function PieChart({
  data = [],
  colors = {},
  height = DEFAULT_HEIGHT,
  innerRadius = DEFAULT_INNER_RADIUS,
  outerRadius = DEFAULT_OUTER_RADIUS,
  paddingAngle = 3,
  showLegend = true,
  emptyLabel = "No data yet.",
  tooltipStyle = DEFAULT_TOOLTIP_STYLE,
}) {
  const { isDarkMode } = useTheme();

  const labels = useMemo(
    () => data.map((item) => String(item?.name ?? "Other")),
    [data]
  );
  const series = useMemo(
    () => data.map((item) => normalizeValue(item?.value)),
    [data]
  );
  const palette = useMemo(
    () => data.map((item) => colors?.[item?.name] ?? colors?.Other ?? DEFAULT_COLOR),
    [colors, data]
  );

  const totalValue = useMemo(
    () => series.reduce((sum, value) => sum + value, 0),
    [series]
  );

  const options = useMemo(() => ({
    chart: {
      type: "donut",
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 720,
        animateGradually: { enabled: true, delay: 90 },
        dynamicAnimation: { enabled: true, speed: 360 },
      },
      fontFamily: "inherit",
    },
    colors: palette,
    labels,
    stroke: {
      width: Math.max(1, Math.round(paddingAngle / 2)),
      colors: [isDarkMode ? "#0f172a" : "#ffffff"],
    },
    dataLabels: { enabled: false },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
    plotOptions: {
      pie: {
        customScale: resolvePieScale(outerRadius),
        expandOnClick: false,
        donut: {
          size: resolveDonutSize(innerRadius, outerRadius),
          labels: {
            show: true,
            name: {
              show: true,
              offsetY: 18,
              color: isDarkMode ? "#94a3b8" : "#64748b",
            },
            value: {
              show: true,
              offsetY: -12,
              fontSize: "22px",
              fontWeight: 700,
              color: isDarkMode ? "#f8fafc" : "#0f172a",
              formatter: (value) => `${Math.round(normalizeValue(value))}`,
            },
            total: {
              show: true,
              showAlways: true,
              label: "Total",
              color: isDarkMode ? "#94a3b8" : "#64748b",
              formatter: () => `${Math.round(totalValue)}`,
            },
          },
        },
      },
    },
    legend: {
      show: showLegend,
      position: "bottom",
      fontSize: "13px",
      labels: {
        colors: isDarkMode ? "#e2e8f0" : "#334155",
      },
      itemMargin: {
        horizontal: 12,
        vertical: 6,
      },
      markers: {
        width: 10,
        height: 10,
        radius: 10,
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
  }), [
    innerRadius,
    isDarkMode,
    labels,
    outerRadius,
    paddingAngle,
    palette,
    showLegend,
    tooltipStyle,
    totalValue,
  ]);

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
        type="donut"
        options={options}
        series={series}
        height="100%"
        width="100%"
      />
    </div>
  );
}

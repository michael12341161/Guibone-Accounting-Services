import React from "react";
import { useTheme } from "../../context/ThemeContext";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function DarkModeToggle({
  className = "",
  showLabel = true,
  ariaLabel,
}) {
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";
  const icon = isDarkMode ? "\u{1F319}" : "\u2600";
  const label = isDarkMode ? "Dark Mode" : "Light Mode";
  const nextModeLabel = isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={ariaLabel || nextModeLabel}
      title={nextModeLabel}
      className={classNames(
        "inline-flex items-center justify-center gap-2 border border-slate-300 bg-white/90 text-slate-700 shadow-sm transition",
        "hover:border-emerald-300 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        showLabel ? "rounded-full px-4 py-2.5 text-sm font-semibold" : "h-[2.25em] w-[2.25em] rounded-lg text-[1em]",
        className
      )}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {icon}
      </span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
}

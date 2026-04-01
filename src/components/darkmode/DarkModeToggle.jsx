import React from "react";
import { Moon, SunMedium } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function DarkModeToggle({ className = "", showLabel = false, ariaLabel }) {
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";
  const currentModeLabel = isDarkMode ? "Dark mode" : "Light mode";
  const nextModeLabel = isDarkMode ? "Switch to light mode" : "Switch to dark mode";

  return (
    <div className={classNames("inline-flex items-center gap-3", className)}>
      <button
        type="button"
        onClick={toggleTheme}
        role="switch"
        aria-checked={isDarkMode}
        aria-label={ariaLabel || nextModeLabel}
        title={nextModeLabel}
        className={classNames(
          "group relative inline-flex h-9 w-[4.25rem] shrink-0 items-center rounded-full border p-[3px] transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
          isDarkMode
            ? "border-slate-700/80 bg-[linear-gradient(180deg,#1e293b_0%,#020617_100%)] shadow-[inset_0_1px_0_rgba(148,163,184,0.12),0_10px_22px_-16px_rgba(2,6,23,0.95)]"
            : "border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_22px_-16px_rgba(15,23,42,0.2)]",
        )}
      >
        <span
          aria-hidden="true"
          className={classNames(
            "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors duration-300",
            isDarkMode ? "text-slate-500/55" : "text-amber-500"
          )}
        >
          <SunMedium className="h-[0.95rem] w-[0.95rem]" strokeWidth={2.2} />
        </span>
        <span
          aria-hidden="true"
          className={classNames(
            "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors duration-300",
            isDarkMode ? "text-emerald-200" : "text-slate-400"
          )}
        >
          <Moon className="h-[0.95rem] w-[0.95rem]" strokeWidth={2.2} />
        </span>

        <span
          aria-hidden="true"
          className={classNames(
            "pointer-events-none absolute left-[3px] top-[3px] h-7 w-7 rounded-full transition-transform duration-300 ease-out",
            "flex items-center justify-center shadow-[0_10px_18px_-14px_rgba(0,0,0,0.9)] ring-1",
            isDarkMode
              ? "translate-x-[2.125rem] bg-[linear-gradient(180deg,#334155_0%,#0f172a_100%)] text-emerald-100 ring-slate-600/60"
              : "translate-x-0 bg-[linear-gradient(180deg,#ffffff_0%,#e2e8f0_100%)] text-amber-500 ring-slate-200",
          )}
        >
          {isDarkMode ? (
            <Moon className="h-[0.95rem] w-[0.95rem] fill-current" strokeWidth={1.8} />
          ) : (
            <SunMedium className="h-[0.95rem] w-[0.95rem]" strokeWidth={2.2} />
          )}
        </span>

        <span className="sr-only">{currentModeLabel}</span>
      </button>

      {showLabel ? (
        <span className={classNames("text-sm font-semibold transition-colors", isDarkMode ? "text-slate-100" : "text-slate-700")}>
          {currentModeLabel}
        </span>
      ) : null}
    </div>
  );
}

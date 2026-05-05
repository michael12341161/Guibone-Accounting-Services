import React, { useEffect, useMemo, useState } from "react";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function RequirementIcon({ met, compact = false }) {
  return (
    <span
      className={classNames(
        `${compact ? "h-4 w-4 text-[10px]" : "h-5 w-5 text-[11px]"} flex shrink-0 items-center justify-center rounded-full border transition-all duration-300`,
        met
          ? "border-sky-300/70 bg-sky-400/15 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.25)]"
          : "border-slate-700 bg-slate-900/40 text-slate-500"
      )}
    >
      {met ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 10 3 3 7-7" />
        </svg>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </span>
  );
}

function RequirementRow({ label, met, delay, compact = false }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <li
      className={classNames(
        `${compact ? "gap-2" : "gap-3"} flex items-center transition-all duration-300 ease-out`,
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        met ? "text-sky-300" : "text-slate-400"
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <RequirementIcon met={met} compact={compact} />
      <span className={compact ? "text-[11px] leading-4" : "text-sm leading-6"}>{label}</span>
    </li>
  );
}

export default function PasswordRequirementsCard({
  title = "Your password must satisfy:",
  requirements = [],
  active = false,
  compact = false,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const completedCount = useMemo(
    () => requirements.filter((requirement) => requirement.met).length,
    [requirements]
  );
  const progressPercent = requirements.length ? (completedCount / requirements.length) * 100 : 0;
  const allMet = requirements.length > 0 && completedCount === requirements.length;

  return (
    <div
      className={classNames(
        `${compact ? "rounded-md px-3 py-3" : "rounded-2xl px-4 py-4"} overflow-hidden border text-white transition-all duration-300 ease-out`,
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        active
          ? "border-sky-400/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_22px_50px_-34px_rgba(56,189,248,0.55)]"
          : "border-slate-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={compact ? "text-[11px] font-semibold text-white" : "text-sm font-semibold text-white"}>{title}</p>
          <p className={compact ? "mt-0.5 text-[10px] text-slate-400" : "mt-1 text-xs text-slate-400"}>
            {completedCount} of {requirements.length} checks ready
          </p>
        </div>

        <span
          className={classNames(
            `${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} rounded-full border font-semibold uppercase tracking-[0.18em] transition-colors duration-300`,
            allMet
              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
              : "border-slate-600/80 bg-white/5 text-slate-300"
          )}
        >
          {allMet ? "Ready" : "Checking"}
        </span>
      </div>

      <div className={compact ? "mt-3 h-1 overflow-hidden rounded-full bg-white/10" : "mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"}>
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(96,165,250,1),rgba(103,232,249,1),rgba(52,211,153,1))] transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ul className={compact ? "mt-3 space-y-1.5" : "mt-4 space-y-3"}>
        {requirements.map((requirement, index) => (
          <RequirementRow
            key={requirement.id}
            label={requirement.label}
            met={requirement.met}
            delay={index * 50}
            compact={compact}
          />
        ))}
      </ul>
    </div>
  );
}

import React from "react";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function LayoutFooter({
  title = "Monitoring System",
  subtitle = "Workspace",
  className = "",
}) {
  return (
    <footer className={classNames("border-t border-slate-200 bg-white/80", className)}>
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        {title ? <span>{title}</span> : null}
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
    </footer>
  );
}

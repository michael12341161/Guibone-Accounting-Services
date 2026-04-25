import React from "react";
import { cn } from "../../lib/utils";

const CARD_VARIANTS = {
  default: "border-slate-200 bg-white text-slate-900",
  muted: "border-slate-200 bg-slate-50 text-slate-900",
  success: "border-emerald-200/60 bg-emerald-50/50 text-emerald-800",
  warning: "border-amber-200/60 bg-amber-50/60 text-amber-800",
  danger: "border-rose-200/60 bg-rose-50/60 text-rose-800",
};

export function Card({
  as: Component = "section",
  children,
  className = "",
  variant = "default",
  interactive = false,
  compact = false,
}) {
  const variantClass = CARD_VARIANTS[variant] || CARD_VARIANTS.default;

  return (
    <Component
      className={cn(
        "w-full rounded-xl border shadow-sm",
        variantClass,
        compact ? "p-4" : "p-5",
        interactive &&
          "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        className
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  children,
  className = "",
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {children}
        {title && (
          <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
        )}
        {description && (
          <p className="text-xs text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({ children, className = "" }) {
  return (
    <h3 className={cn("text-sm font-semibold leading-none tracking-tight", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = "" }) {
  return (
    <p className={cn("text-xs text-slate-500", className)}>
      {children}
    </p>
  );
}

export function CardContent({ children, className = "" }) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className = "",
  align = "end",
}) {
  const alignment =
    align === "between"
      ? "justify-between"
      : align === "start"
      ? "justify-start"
      : "justify-end";

  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4",
        alignment,
        className
      )}
    >
      {children}
    </div>
  );
}

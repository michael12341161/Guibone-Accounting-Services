import React from "react";

const VARIANT_STYLES = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500/20",
  secondary:
    "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-700 focus-visible:ring-slate-400/20",
};

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export default function AuthButton({
  type = "button",
  variant = "primary",
  fullWidth = false,
  disabled = false,
  loading = false,
  loadingText = "Loading...",
  className = "",
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={classNames(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:opacity-70",
        VARIANT_STYLES[variant] || VARIANT_STYLES.primary,
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <SpinnerIcon />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

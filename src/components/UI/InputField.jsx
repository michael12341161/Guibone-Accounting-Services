import React from "react";
import { cn } from "../../lib/utils";

export default function InputField({
  id,
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
  autoComplete,
  maxLength,
  readOnly = false,
  disabled = false,
  error = "",
  helperText = "",
  containerClassName = "",
  inputClassName = "",
  labelClassName = "",
  rightAdornment = null,
  compact = false,
  ...props
}) {
  const inputId = id || name;
  const hasAdornment = Boolean(rightAdornment);

  return (
    <div className={containerClassName}>
      {label ? (
        <label
          htmlFor={inputId}
          className={cn(compact ? "mb-1 block text-[11px] font-medium text-slate-700" : "mb-2 block text-sm font-medium text-slate-700", labelClassName)}
        >
          {label}
          {required ? <span className="ml-1 text-rose-600">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          maxLength={maxLength}
          readOnly={readOnly}
          disabled={disabled}
          aria-invalid={error ? "true" : "false"}
          className={cn(
            compact
              ? "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400"
              : "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
            error && "border-rose-400 focus-visible:ring-rose-500",
            (readOnly || disabled) && "bg-slate-100 text-slate-500",
            hasAdornment && "pr-10",
            inputClassName
          )}
          {...props}
        />
        {hasAdornment ? <div className="absolute inset-y-0 right-3 flex items-center">{rightAdornment}</div> : null}
      </div>
      {helperText ? <p className={compact ? "mt-1 text-[10px] text-slate-500" : "mt-2 text-xs text-slate-500"}>{helperText}</p> : null}
      {error ? <p className={compact ? "mt-1 text-[10px] text-rose-600" : "mt-2 text-xs text-rose-600"}>{error}</p> : null}
    </div>
  );
}

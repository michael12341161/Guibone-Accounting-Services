import React from "react";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function AuthInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required = true,
  inputRef,
  rightAdornment = null,
  inputClassName = "",
  containerClassName = "",
  labelClassName = "",
  ...props
}) {
  return (
    <div className={containerClassName}>
      {label ? (
        <label
          htmlFor={id}
          className={classNames("block text-xs font-medium text-slate-700", labelClassName)}
        >
          {required ? <span className="mr-1 text-rose-500">*</span> : null}
          {label}
        </label>
      ) : null}

      <div className="relative mt-1.5">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={classNames(
            "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15",
            rightAdornment && "pr-10",
            inputClassName
          )}
          {...props}
        />

        {rightAdornment ? (
          <div className="absolute inset-y-0 right-2 flex items-center">{rightAdornment}</div>
        ) : null}
      </div>
    </div>
  );
}

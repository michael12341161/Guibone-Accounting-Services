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
          className={classNames("block text-sm font-medium text-slate-700", labelClassName)}
        >
          {required ? <span className="mr-1 text-rose-500">*</span> : null}
          {label}
        </label>
      ) : null}

      <div className="relative mt-2">
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={classNames(
            "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15",
            rightAdornment && "pr-11",
            inputClassName
          )}
          {...props}
        />

        {rightAdornment ? (
          <div className="absolute inset-y-0 right-2.5 flex items-center">{rightAdornment}</div>
        ) : null}
      </div>
    </div>
  );
}

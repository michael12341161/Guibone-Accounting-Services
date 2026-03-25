import React from "react";
import { cn } from "../../lib/utils";

const BASE_BUTTON_STYLES =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50";

const VARIANT_STYLES = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
  secondary:
    "border border-input bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  danger: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  outline:
    "border border-input bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
  ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZE_STYLES = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-sm",
};

const ICON_SIZE_STYLES = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  disabled = false,
  type = "button",
  children,
  ...props
}) {
  const variantClasses = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
  const sizeClasses = SIZE_STYLES[size] || SIZE_STYLES.md;

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        BASE_BUTTON_STYLES,
        fullWidth && "w-full",
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  variant = "secondary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
  children,
  ...props
}) {
  const variantClasses = VARIANT_STYLES[variant] || VARIANT_STYLES.secondary;
  const sizeClasses = ICON_SIZE_STYLES[size] || ICON_SIZE_STYLES.md;

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        BASE_BUTTON_STYLES,
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}


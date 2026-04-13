import React, { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

const ANIMATION_MS = 200;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnOverlayClick = true,
}) {
  const [visible, setVisible] = useState(open);
  const [rendered, setRendered] = useState(open);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open) {
      setRendered(true);
      window.requestAnimationFrame(() => setVisible(true));
      return undefined;
    }

    if (!rendered) return undefined;

    setVisible(false);
    const timeout = window.setTimeout(() => setRendered(false), ANIMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) return undefined;

    const handler = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rendered, onClose]);

  useEffect(() => {
    if (!rendered) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [rendered]);

  if (!rendered) return null;

  const sizeClasses =
    size === "sm"
      ? "max-w-md"
      : size === "lg"
        ? "max-w-3xl"
        : size === "xl"
          ? "max-w-5xl"
          : "max-w-xl";

  const handleOverlayClick = () => {
    if (!closeOnOverlayClick) return;
    onClose?.();
  };

  const content = (
    <div className="fixed inset-0 z-[60]">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleOverlayClick}
      />

      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start justify-center px-4 py-6 sm:items-center sm:px-6 sm:py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "relative w-full",
              sizeClasses,
              "rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg",
              "transition-[opacity,transform] duration-200 ease-out",
              visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            )}
          >
            <div className="flex max-h-[calc(100vh-3rem)] flex-col sm:max-h-[calc(100vh-4rem)]">
              {(title || description || onClose) && (
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
                  <div className="min-w-0 space-y-1">
                    {title && (
                      <h2 id={titleId} className="text-base font-semibold leading-none tracking-tight">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p id={descriptionId} className="text-sm text-slate-600">
                        {description}
                      </p>
                    )}
                  </div>

                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors",
                        "hover:bg-slate-100 hover:text-slate-700",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                      )}
                      aria-label="Close"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18 18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              <div className="overflow-y-auto px-6 py-5 text-sm text-slate-700">
                {children}
              </div>

              {footer && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

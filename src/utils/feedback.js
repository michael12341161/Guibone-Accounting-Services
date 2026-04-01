import { useEffect, useRef } from "react";
import Swal from "sweetalert2";
import { toast } from "react-hot-toast";

const TOAST_STYLE = {
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#0f172a",
};

function normalizeToastInput(input, fallbackTitle) {
  if (typeof input === "string") {
    return { title: input };
  }

  if (input && typeof input === "object") {
    return input;
  }

  return { title: fallbackTitle };
}

function buildToastMessage(input, fallbackTitle) {
  const config = normalizeToastInput(input, fallbackTitle);
  const title = String(config.title ?? config.message ?? fallbackTitle ?? "Notification").trim();
  const description = String(config.description ?? config.text ?? "").trim();

  return {
    message: description && description !== title ? `${title}: ${description}` : title || description || fallbackTitle,
    duration: Number.isFinite(config.duration) ? config.duration : null,
    id: config.id,
  };
}

function buildToastOptions(duration, id) {
  return {
    ...(duration !== null ? { duration } : {}),
    ...(id ? { id } : {}),
  };
}

export const APP_TOASTER_PROPS = {
  position: "top-right",
  toastOptions: {
    duration: 2400,
    style: TOAST_STYLE,
  },
};

export function showSuccessToast(input) {
  const { message, duration, id } = buildToastMessage(input, "Success");
  return toast.success(message, buildToastOptions(duration ?? 2200, id));
}

export function showErrorToast(input) {
  const { message, duration, id } = buildToastMessage(input, "Something went wrong");
  return toast.error(message, buildToastOptions(duration ?? 2600, id));
}

export function showInfoToast(input) {
  const { message, duration, id } = buildToastMessage(input, "Notice");
  return toast(message, buildToastOptions(duration ?? 2200, id));
}

export function useErrorToast(message, options = {}) {
  const lastMessageRef = useRef("");
  const { duration, id } = options;

  useEffect(() => {
    const normalizedMessage = String(message || "").trim();

    if (!normalizedMessage) {
      lastMessageRef.current = "";
      return;
    }

    if (normalizedMessage === lastMessageRef.current) {
      return;
    }

    lastMessageRef.current = normalizedMessage;
    showErrorToast({
      title: normalizedMessage,
      duration,
      id,
    });
  }, [message, duration, id]);
}

export function showAlertDialog(options = {}) {
  return Swal.fire({
    confirmButtonColor: "#2563eb",
    ...options,
  });
}

export function showConfirmDialog(options = {}) {
  return Swal.fire({
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Confirm",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#2563eb",
    cancelButtonColor: "#64748b",
    reverseButtons: true,
    ...options,
  });
}

export function showDangerConfirmDialog(options = {}) {
  return Swal.fire({
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Confirm",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#64748b",
    reverseButtons: true,
    ...options,
  });
}

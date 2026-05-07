import { useCallback, useEffect, useReducer, useRef } from "react";
import Swal from "sweetalert2";
import { toast } from "react-hot-toast";
import {
  MONITORING_AUTH_REQUIRED_MESSAGE,
  MONITORING_SESSION_EXPIRED_MESSAGE,
} from "../services/api";

const TOAST_STYLE = {
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: "8px",
  boxShadow: "0 14px 30px -22px rgba(15, 23, 42, 0.45)",
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: "16px",
  maxWidth: "280px",
  minHeight: "0",
  padding: "7px 10px",
};

let alertDialogQueue = Promise.resolve();

function isSuppressedAuthToastMessage(message) {
  const normalizedMessage = String(message || "").trim().toLowerCase();
  if (!normalizedMessage) {
    return false;
  }

  return [
    MONITORING_AUTH_REQUIRED_MESSAGE,
    MONITORING_SESSION_EXPIRED_MESSAGE,
  ].some((candidate) => normalizedMessage === String(candidate).trim().toLowerCase());
}

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
  gutter: 6,
  containerStyle: {
    top: 12,
    right: 12,
  },
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
  if (isSuppressedAuthToastMessage(message)) {
    return undefined;
  }
  return toast.error(message, buildToastOptions(duration ?? 2600, id));
}

export function showInfoToast(input) {
  const { message, duration, id } = buildToastMessage(input, "Notice");
  return toast(message, buildToastOptions(duration ?? 2200, id));
}

export function useErrorToast(message, options = {}) {
  const lastMessageRef = useRef("");
  const lastTriggerRef = useRef(undefined);
  const { duration, id, trigger } = options;

  useEffect(() => {
    const normalizedMessage = String(message || "").trim();

    if (!normalizedMessage) {
      lastMessageRef.current = "";
      lastTriggerRef.current = trigger;
      return;
    }

    if (
      normalizedMessage === lastMessageRef.current &&
      trigger === lastTriggerRef.current
    ) {
      return;
    }

    lastMessageRef.current = normalizedMessage;
    lastTriggerRef.current = trigger;
    showErrorToast({
      title: normalizedMessage,
      duration,
      id,
    });
  }, [message, duration, id, trigger]);
}

export function useErrorToastState(initialMessage = "", options = {}) {
  const [state, dispatch] = useReducer(
    (current, action) => {
      const nextValue =
        typeof action === "function" ? action(current.value) : action;
      const normalizedValue = String(nextValue || "").trim();

      return {
        value: nextValue,
        trigger: normalizedValue ? current.trigger + 1 : current.trigger,
      };
    },
    {
      value: initialMessage,
      trigger: 0,
    }
  );

  useErrorToast(state.value, {
    ...options,
    trigger: state.trigger,
  });

  const setValue = useCallback((value) => {
    dispatch(value);
  }, []);

  return [state.value, setValue];
}

export function showAlertDialog(options = {}) {
  const dialogOptions = {
    confirmButtonColor: "#2563eb",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showCloseButton: false,
    ...options,
  };

  const queuedDialog = alertDialogQueue.then(
    () => Swal.fire(dialogOptions),
    () => Swal.fire(dialogOptions)
  );

  alertDialogQueue = queuedDialog.then(
    () => undefined,
    () => undefined
  );

  return queuedDialog;
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

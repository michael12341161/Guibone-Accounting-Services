import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ImageUp,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/UI/buttons";
import { cn } from "../../lib/utils";
import {
  api,
  fetchPaymentMethods,
  resolveBackendAssetUrl,
  submitPaymentReceipt,
} from "../../services/api";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";
import { useAuth } from "../../hooks/useAuth";

const PAYMENT_SELECTION_STORAGE_PREFIX = "monitoring:client-payment-method";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

function readStoredSessionUser() {
  try {
    const raw = sessionStorage.getItem("session:user");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildPaymentSelectionStorageKey(user) {
  const clientId = toPositiveInteger(user?.client_id ?? user?.Client_ID);
  if (clientId) {
    return `${PAYMENT_SELECTION_STORAGE_PREFIX}:client:${clientId}`;
  }

  const userId = toPositiveInteger(user?.id);
  if (userId) {
    return `${PAYMENT_SELECTION_STORAGE_PREFIX}:user:${userId}`;
  }

  return `${PAYMENT_SELECTION_STORAGE_PREFIX}:session`;
}

function readStoredMethodId(storageKey) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const sessionValue = String(window.sessionStorage.getItem(storageKey) || "").trim();
    if (sessionValue) {
      return sessionValue;
    }

    const legacyValue = String(window.localStorage.getItem(storageKey) || "").trim();
    if (legacyValue) {
      window.sessionStorage.setItem(storageKey, legacyValue);
      return legacyValue;
    }
  } catch (_) {}

  return "";
}

function writeStoredMethodId(storageKey, methodId) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedMethodId = String(methodId || "").trim();

  try {
    if (!normalizedMethodId) {
      window.sessionStorage.removeItem(storageKey);
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(storageKey, normalizedMethodId);
    window.localStorage.removeItem(storageKey);
  } catch (_) {}
}

function resolveSelectedMethodId(
  methods,
  storageKey,
  currentSelectedId,
  preferredMethodId = ""
) {
  const preferredId = String(preferredMethodId || "").trim();
  if (preferredId && methods.some((method) => String(method.id) === preferredId)) {
    writeStoredMethodId(storageKey, preferredId);
    return preferredId;
  }

  const storedMethodId = readStoredMethodId(storageKey);
  const hasStoredMethod = methods.some((method) => String(method.id) === storedMethodId);

  if (storedMethodId && !hasStoredMethod) {
    writeStoredMethodId(storageKey, "");
  }

  const normalizedCurrentId = String(currentSelectedId || "").trim();
  const hasCurrentMethod = methods.some((method) => String(method.id) === normalizedCurrentId);
  if (hasCurrentMethod) {
    return normalizedCurrentId;
  }

  return hasStoredMethod ? storedMethodId : "";
}

function validateReceiptFile(file) {
  if (!file) {
    return "Please choose a JPG or PNG receipt image.";
  }

  const fileName = String(file.name || "").toLowerCase();
  const hasAllowedExtension = [".jpg", ".jpeg", ".png"].some((extension) => fileName.endsWith(extension));
  const hasAllowedMimeType = ["image/jpeg", "image/png"].includes(String(file.type || "").toLowerCase());

  if (!hasAllowedExtension || !hasAllowedMimeType) {
    return "Receipt image must be a JPG or PNG file.";
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    return "Receipt image must be 5MB or smaller.";
  }

  return "";
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPaymentDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizePaymentStatus(value) {
  const status = String(value || "").trim();
  return status || "Pending";
}

function getPaymentStatusKey(status) {
  const value = normalizePaymentStatus(status).toLowerCase();
  if (value === "rejected" || value === "declined") {
    return "reject";
  }
  return value;
}

function getPaymentStatusClasses(status, hasPaymentRecord = false) {
  const value = getPaymentStatusKey(status);

  if (value === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value === "processing") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (value === "reject" || value === "rejected" || value === "declined") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return hasPaymentRecord
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

function isConsultationAppointment(appointment) {
  const kind = String(appointment?.record_kind || "").trim().toLowerCase();
  if (kind === "consultation") {
    return true;
  }

  const type = String(
    appointment?.appointment_type ||
      appointment?.Appointment_Type ||
      appointment?.meeting_type ||
      appointment?.meetingType ||
      ""
  )
    .trim()
    .toLowerCase();

  return type.startsWith("consult");
}

function getAppointmentId(appointment) {
  return toPositiveInteger(
    appointment?.Appointment_ID ?? appointment?.appointment_id ?? appointment?.id
  );
}

function getAppointmentLabel(appointment) {
  const serviceName = String(
    appointment?.service_name || appointment?.service || appointment?.Name || "Appointment"
  ).trim();
  const dateLabel = formatPaymentDate(appointment?.date || appointment?.Date);
  return dateLabel ? `${serviceName} - ${dateLabel}` : serviceName;
}

function getPaymentMethodDescription(method) {
  return String(method?.description || "").trim() || "Available from the current payment type records.";
}

function getPaymentMethodOptionLabel(method) {
  const name = String(method?.name || "Payment method").trim() || "Payment method";
  const description = getPaymentMethodDescription(method);
  return description ? `${name} - ${description}` : name;
}

function PaymentMethodSkeleton() {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
      <div className="animate-pulse space-y-4">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded bg-slate-200" />
          <div className="h-4 w-72 rounded bg-slate-100" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.95fr)]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-slate-200" />
                <div className="h-11 rounded-2xl bg-white" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="h-11 rounded-2xl bg-white" />
              </div>
            </div>
            <div className="h-24 rounded-2xl bg-white" />
          </div>
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex gap-2">
              <div className="h-7 w-20 rounded-full bg-slate-100" />
              <div className="h-7 w-24 rounded-full bg-slate-100" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-20 rounded-2xl bg-slate-100" />
              <div className="h-20 rounded-2xl bg-slate-100" />
            </div>
            <div className="h-20 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PaymentPage() {
  const { user: authUser } = useAuth();
  const currentUser = authUser || readStoredSessionUser();
  const selectionStorageKey = buildPaymentSelectionStorageKey(currentUser);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);

  const [appointments, setAppointments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  useErrorToast(error);

  const requestedAppointmentId = useMemo(
    () => toPositiveInteger(searchParams.get("appointment_id")),
    [searchParams]
  );

  const serviceAppointments = useMemo(
    () => appointments.filter((appointment) => !isConsultationAppointment(appointment)),
    [appointments]
  );

  const paidHistoryAppointments = useMemo(
    () =>
      serviceAppointments.filter((appointment) => {
        const payment = appointment?.payment || null;
        const hasPayment = Boolean(appointment?.payment_exists ?? payment?.exists);
        if (!hasPayment) {
          return false;
        }

        const status = normalizePaymentStatus(
          appointment?.payment_status_name || appointment?.payment_status || payment?.status_name
        );
        return getPaymentStatusKey(status) === "paid";
      }),
    [serviceAppointments]
  );

  const activeServiceAppointments = useMemo(
    () =>
      serviceAppointments.filter((appointment) => {
        const payment = appointment?.payment || null;
        const hasPayment = Boolean(appointment?.payment_exists ?? payment?.exists);
        if (!hasPayment) {
          return true;
        }

        const status = normalizePaymentStatus(
          appointment?.payment_status_name || appointment?.payment_status || payment?.status_name
        );
        return getPaymentStatusKey(status) !== "paid";
      }),
    [serviceAppointments]
  );

  const selectedAppointment = useMemo(() => {
    if (activeServiceAppointments.length === 0) {
      return null;
    }

    if (requestedAppointmentId) {
      return (
        activeServiceAppointments.find(
          (appointment) => getAppointmentId(appointment) === requestedAppointmentId
        ) || activeServiceAppointments[0]
      );
    }

    return activeServiceAppointments[0];
  }, [activeServiceAppointments, requestedAppointmentId]);

  const selectedAppointmentId = getAppointmentId(selectedAppointment);
  const selectedAppointmentKey = String(selectedAppointmentId || "");
  const selectedAppointmentPreferredMethodId = useMemo(
    () =>
      String(
        selectedAppointment?.payment_type_id || selectedAppointment?.payment?.payment_type_id || ""
      ).trim(),
    [selectedAppointment?.payment?.payment_type_id, selectedAppointment?.payment_type_id]
  );

  const selectedMethod =
    paymentMethods.find((method) => String(method.id) === String(selectedMethodId)) || null;
  const existingPayment = selectedAppointment?.payment || null;
  const hasExistingPayment = Boolean(
    selectedAppointment?.payment_exists ?? existingPayment?.exists
  );
  const existingPaymentStatus = normalizePaymentStatus(
    selectedAppointment?.payment_status_name || existingPayment?.status_name
  );
  const existingPaymentStatusKey = getPaymentStatusKey(existingPaymentStatus);
  const existingPaymentMethodName =
    selectedAppointment?.payment_method_name || existingPayment?.payment_method_name || "";
  const existingReceiptPath =
    selectedAppointment?.payment_screenshot || existingPayment?.screenshot || "";
  const existingReceiptPreviewUrl = existingReceiptPath
    ? resolveBackendAssetUrl(existingReceiptPath)
    : "";
  const currentPreviewUrl = receiptPreviewUrl || existingReceiptPreviewUrl;
  const isPaymentProcessing = hasExistingPayment && existingPaymentStatusKey === "processing";
  const isPaymentPaid = hasExistingPayment && existingPaymentStatusKey === "paid";
  const canChooseReceipt =
    Boolean(selectedMethodId && selectedAppointmentId) && !isSubmitting && !isPaymentProcessing && !isPaymentPaid;
  const selectedAppointmentLabel = getAppointmentLabel(selectedAppointment);
  const paymentStatusMessage = isPaymentPaid
    ? "This appointment payment has already been approved as Paid."
    : isPaymentProcessing
      ? "Your uploaded receipt is currently under admin review."
      : existingPaymentStatusKey === "reject"
        ? "The previous receipt was rejected. Please upload a new image."
        : existingPaymentMethodName
          ? `${existingPaymentMethodName} receipt submitted.`
          : "No receipt uploaded yet for this appointment.";
  const paymentMethodSummaryLabel =
    selectedMethod?.name || existingPaymentMethodName || "Choose a payment method";
  const paymentMethodSummaryDescription = selectedMethod
    ? getPaymentMethodDescription(selectedMethod)
    : existingPaymentMethodName
      ? "This method is attached to the latest receipt saved for this appointment."
      : paymentMethods.length === 0
        ? "No payment methods are available yet."
        : "Select the payment method you will use for this appointment.";

  const resetReceiptDraft = () => {
    setReceiptFile(null);
    setFileError("");
    setReceiptPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return "";
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const loadPaymentPageData = async ({ showLoader = true } = {}) => {
    try {
      if (showLoader && isMountedRef.current) {
        setLoading(true);
      }

      if (isMountedRef.current) {
        setError("");
      }

      const queryParams = {
        client_id: currentUser?.client_id || currentUser?.Client_ID || undefined,
        client_username: currentUser?.username || undefined,
      };

      const [appointmentResponse, methodResponse] = await Promise.all([
        api.get("appointment_list.php", { params: queryParams }),
        fetchPaymentMethods(),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const appointmentRows = Array.isArray(appointmentResponse?.data?.appointments)
        ? appointmentResponse.data.appointments
        : Array.isArray(appointmentResponse?.data?.rows)
          ? appointmentResponse.data.rows
          : Array.isArray(appointmentResponse?.data)
            ? appointmentResponse.data
            : [];
      const methods = Array.isArray(methodResponse?.data?.payment_methods)
        ? methodResponse.data.payment_methods
        : [];

      const nextAppointments = appointmentRows
        .filter((appointment) => !isConsultationAppointment(appointment))
        .sort((left, right) => {
          const leftId = getAppointmentId(left) || 0;
          const rightId = getAppointmentId(right) || 0;
          return rightId - leftId;
        });
      const nextActiveAppointments = nextAppointments.filter((appointment) => {
        const payment = appointment?.payment || null;
        const hasPayment = Boolean(appointment?.payment_exists ?? payment?.exists);
        if (!hasPayment) {
          return true;
        }

        const status = normalizePaymentStatus(
          appointment?.payment_status_name || appointment?.payment_status || payment?.status_name
        );
        return getPaymentStatusKey(status) !== "paid";
      });

      const preferredAppointment = requestedAppointmentId
        ? nextActiveAppointments.find(
            (appointment) => getAppointmentId(appointment) === requestedAppointmentId
          ) || nextActiveAppointments[0] || null
        : nextActiveAppointments[0] || null;
      const preferredMethodId = String(
        preferredAppointment?.payment_type_id ??
          preferredAppointment?.payment?.payment_type_id ??
          ""
      ).trim();

      setAppointments(nextAppointments);
      setPaymentMethods(methods);
      setSelectedMethodId((current) =>
        resolveSelectedMethodId(methods, selectionStorageKey, current, preferredMethodId)
      );
    } catch (requestError) {
      if (!isMountedRef.current) {
        return;
      }

      setAppointments([]);
      setPaymentMethods([]);
      setSelectedMethodId("");
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load payment details right now."
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadPaymentPageData({ showLoader: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionStorageKey, currentUser?.client_id, currentUser?.Client_ID, currentUser?.username]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl && receiptPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    if (!selectedAppointment || !paymentMethods.length) {
      return;
    }

    setSelectedMethodId((current) =>
      resolveSelectedMethodId(
        paymentMethods,
        selectionStorageKey,
        current,
        selectedAppointmentPreferredMethodId
      )
    );
  }, [
    paymentMethods,
    selectedAppointment,
    selectedAppointmentPreferredMethodId,
    selectedAppointmentKey,
    selectionStorageKey,
  ]);

  useEffect(() => {
    if (!selectedAppointment) {
      return;
    }

    const nextAppointmentId = getAppointmentId(selectedAppointment);
    if (!nextAppointmentId || nextAppointmentId === requestedAppointmentId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("appointment_id", String(nextAppointmentId));
    setSearchParams(nextParams, { replace: true });
  }, [requestedAppointmentId, searchParams, selectedAppointment, setSearchParams]);

  useEffect(() => {
    resetReceiptDraft();
    setSuccessMessage("");
    setError("");
  }, [selectedAppointmentKey]);

  const handleAppointmentSelection = (event) => {
    const nextAppointmentId = toPositiveInteger(event.target.value);
    const nextParams = new URLSearchParams(searchParams);

    if (nextAppointmentId) {
      nextParams.set("appointment_id", String(nextAppointmentId));
    } else {
      nextParams.delete("appointment_id");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const handleMethodSelection = (methodId) => {
    const normalizedMethodId = String(methodId || "").trim();
    resetReceiptDraft();
    setSuccessMessage("");
    setError("");
    setSelectedMethodId(normalizedMethodId);
    writeStoredMethodId(selectionStorageKey, normalizedMethodId);
  };

  const handleChooseReceipt = () => {
    if (!canChooseReceipt) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleReceiptSelected = (event) => {
    const file = event?.target?.files?.[0] || null;
    if (!file) {
      return;
    }

    const validationMessage = validateReceiptFile(file);
    if (validationMessage) {
      resetReceiptDraft();
      setFileError(validationMessage);
      setSuccessMessage("");
      event.target.value = "";
      return;
    }

    setReceiptPreviewUrl((current) => {
      if (current && current.startsWith("blob:")) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
    setReceiptFile(file);
    setError("");
    setFileError("");
    setSuccessMessage("");
  };

  const handleUploadReceipt = async () => {
    if (!selectedAppointmentId) {
      setFileError("Please select an appointment first.");
      return;
    }

    if (!selectedMethodId) {
      setFileError("Please select a payment method first.");
      return;
    }

    if (!receiptFile) {
      setFileError("Please choose a JPG or PNG receipt image to upload.");
      return;
    }

    if (isPaymentProcessing) {
      setFileError("This payment is already being reviewed by the admin.");
      return;
    }

    if (isPaymentPaid) {
      setFileError("This appointment has already been marked as paid.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setFileError("");
      setSuccessMessage("");

      const formData = new FormData();
      formData.append("appointment_id", String(selectedAppointmentId));
      formData.append("payment_type_id", String(selectedMethodId));
      formData.append("receipt", receiptFile);

      const response = await submitPaymentReceipt(formData);
      const nextPayment = response?.data?.payment || null;
      const nextMessage = response?.data?.message || "Payment receipt uploaded successfully.";
      const resolvedStatusName = normalizePaymentStatus(nextPayment?.status_name);

      setAppointments((currentAppointments) =>
        currentAppointments.map((appointment) => {
          if (getAppointmentId(appointment) !== selectedAppointmentId) {
            return appointment;
          }

          const paymentRecord = {
            exists: true,
            id: nextPayment?.id ?? appointment?.payment?.id ?? null,
            appointment_id: selectedAppointmentId,
            payment_type_id: nextPayment?.payment_type_id ?? null,
            payment_method_name: nextPayment?.payment_method_name || "",
            screenshot: nextPayment?.screenshot || "",
            status_id: nextPayment?.status_id ?? null,
            status_name: resolvedStatusName,
            date: nextPayment?.date || "",
            status_source: "record",
          };

          return {
            ...appointment,
            payment_exists: true,
            payment_status_id: paymentRecord.status_id,
            payment_status_name: paymentRecord.status_name,
            payment_status: paymentRecord.status_name,
            payment_type_id: paymentRecord.payment_type_id,
            payment_method_name: paymentRecord.payment_method_name,
            payment_date: paymentRecord.date,
            payment_screenshot: paymentRecord.screenshot,
            payment: paymentRecord,
          };
        })
      );

      resetReceiptDraft();
      setSuccessMessage(nextMessage);
      showSuccessToast({
        title: "Receipt uploaded",
        description: nextPayment?.payment_method_name
          ? `${nextPayment.payment_method_name} receipt uploaded successfully.`
          : nextMessage,
      });
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to upload your payment receipt right now."
      );
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {!loading && serviceAppointments.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-5 py-10 text-center sm:px-6">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
              <ReceiptText className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">No appointment selected yet</h2>
              <p className="text-sm leading-6 text-slate-500">
                Create or select a service appointment first, then return here to choose a payment
                method and upload your receipt.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/client/appointment")} className="rounded-full px-4">
              Open appointments
            </Button>
          </div>
        </section>
      ) : !loading && activeServiceAppointments.length === 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-6">
          <div className="mx-auto max-w-xl space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-50 text-slate-500 ring-1 ring-slate-200">
              <ReceiptText className="h-6 w-6" strokeWidth={1.8} />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">No active payment transactions</h2>
              <p className="text-sm leading-6 text-slate-600">
                {paidHistoryAppointments.length > 0
                  ? "All appointments with approved Paid status have been moved to Payment History."
                  : "There are no active payment transactions available right now."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {paidHistoryAppointments.length > 0 ? (
                <Link
                  to="/client/payment/history"
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Open payment history
                </Link>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigate("/client/appointment")}
                className="rounded-full px-4"
              >
                Open appointments
              </Button>
            </div>
          </div>
        </section>
      ) : selectedAppointment ? (
        <>
          <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-950">Payment method</h2>
                <p className="text-sm text-slate-500">
                  Choose from the payment methods currently stored in the database.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.95fr)]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Appointment
                    </span>
                    <select
                      value={selectedAppointmentId || ""}
                      onChange={handleAppointmentSelection}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    >
                      {activeServiceAppointments.map((appointment) => {
                        const appointmentId = getAppointmentId(appointment);
                        return (
                          <option
                            key={`appointment-option-${appointmentId || getAppointmentLabel(appointment)}`}
                            value={appointmentId || ""}
                          >
                            {getAppointmentLabel(appointment)}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Method
                    </span>
                    {paymentMethods.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                        No payment methods are available yet.
                      </div>
                    ) : (
                      <select
                        value={selectedMethodId}
                        onChange={(event) => handleMethodSelection(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="">Select a payment method</option>
                        {paymentMethods.map((method) => (
                          <option key={`payment-method-option-${method.id}`} value={method.id}>
                            {getPaymentMethodOptionLabel(method)}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Selected method
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">
                    {paymentMethodSummaryLabel}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    {paymentMethodSummaryDescription}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_-38px_rgba(15,23,42,0.25)] sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                      getPaymentStatusClasses(existingPaymentStatus, hasExistingPayment)
                    )}
                  >
                    {existingPaymentStatus}
                  </span>

                  {selectedAppointment?.payment_date ? (
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {formatPaymentDate(selectedAppointment.payment_date)}
                    </span>
                  ) : null}

                  {selectedMethod ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
                      {selectedMethod.name} selected
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Appointment
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {selectedAppointmentLabel}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Payment method
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {paymentMethodSummaryLabel}
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "mt-4 rounded-2xl border px-4 py-3 text-sm leading-6",
                    isPaymentPaid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : isPaymentProcessing
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : existingPaymentStatusKey === "reject"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                  )}
                >
                  {paymentStatusMessage}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.88),rgba(255,255,255,1))] px-5 py-5 sm:px-6 sm:py-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-950">Upload receipt</h2>
                  <p className="text-sm leading-6 text-slate-500">
                    {isPaymentPaid
                      ? "This payment is complete. No further receipt upload is needed."
                      : isPaymentProcessing
                        ? "Your latest receipt is already under review. Wait for the admin decision before uploading again."
                        : selectedMethod
                          ? `Upload a JPG or PNG screenshot for ${selectedMethod.name}.`
                          : "Select a payment method first, then upload a JPG or PNG screenshot of your receipt."}
                  </p>
                </div>

                <div
                  className={cn(
                    "rounded-[28px] border border-dashed p-5 transition-colors sm:p-6",
                    currentPreviewUrl
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-300 bg-white/80"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handleReceiptSelected}
                    className="sr-only"
                  />

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                        <ImageUp className="h-5 w-5" strokeWidth={1.8} />
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">
                          {receiptFile
                            ? receiptFile.name
                            : existingReceiptPreviewUrl
                              ? "Latest uploaded receipt"
                              : "Add a receipt screenshot"}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-slate-500">
                          {receiptFile
                            ? `${selectedMethod?.name || "Selected payment method"} receipt is ready to upload.`
                            : existingReceiptPreviewUrl
                              ? "The latest uploaded receipt for this appointment is shown in the preview panel."
                              : "Accepted formats: JPG or PNG. Maximum file size: 5MB."}
                        </div>
                        {receiptFile ? (
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {formatFileSize(receiptFile.size)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {fileError ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        {fileError}
                      </div>
                    ) : null}

                    {isPaymentProcessing ? (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                        The current receipt is being reviewed. You can upload again if the admin rejects it.
                      </div>
                    ) : null}

                    {isPaymentPaid ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        Payment verified successfully. This appointment is already marked as paid.
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleChooseReceipt}
                        disabled={!canChooseReceipt}
                        className="rounded-full px-4"
                      >
                        {currentPreviewUrl ? "Choose another image" : "Choose image"}
                      </Button>

                      {receiptFile ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetReceiptDraft}
                          disabled={isSubmitting}
                          className="rounded-full px-4"
                        >
                          Remove selected file
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        onClick={handleUploadReceipt}
                        disabled={!receiptFile || !selectedMethod || isSubmitting || isPaymentProcessing || isPaymentPaid}
                        className="rounded-full px-4"
                      >
                        {isSubmitting ? "Uploading..." : "Upload receipt"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_45px_-38px_rgba(15,23,42,0.35)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    <span>Receipt preview</span>
                    {existingPaymentMethodName ? (
                      <span className="text-slate-500">{existingPaymentMethodName}</span>
                    ) : null}
                  </div>

                  {currentPreviewUrl ? (
                    <img
                      src={currentPreviewUrl}
                      alt="Payment receipt preview"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="grid min-h-[280px] place-items-center px-6 py-10 text-center">
                      <div className="max-w-xs space-y-3">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
                          <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
                        </div>
                        <div className="text-sm font-semibold text-slate-900">
                          Preview appears here
                        </div>
                        <div className="text-sm leading-6 text-slate-500">
                          Pick a receipt image and it will appear instantly before upload.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </section>
        </>
      ) : null}

      {loading ? (
        <PaymentMethodSkeleton />
      ) : null}
    </div>
  );
}

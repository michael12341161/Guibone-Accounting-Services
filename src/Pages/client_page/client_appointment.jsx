import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/UI/buttons";
import { Modal } from "../../components/UI/modal";
import {
  api,
  DEFAULT_SYSTEM_CONFIGURATION,
  fetchAvailableServices,
  fetchPublicSystemConfiguration,
} from "../../services/api";
import { fetchConsultationSlots } from "../../services/consultationSlots";
import { getEstimatedServiceDuration } from "../../utils/serviceDurations";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";
import { showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";
import {
  DEFAULT_CONSULTATION_TIME_SLOTS,
  getConfiguredConsultationTimesForDate,
  hasConfiguredConsultationSlots,
  toConsultationTimeLabel,
} from "../../utils/consultationSlots";

const DEFAULT_SERVICE_ACCESS = {
  businessRegistered: null,
  businessPermitExpired: false,
  restrictedToProcessing: false,
  restrictionReason: null,
};

const ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp";
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ALLOWED_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
]);
const WORD_EXT = new Set(["doc", "docx"]);
const EXCEL_EXT = new Set(["xls", "xlsx", "csv"]);
const PDF_EXT = new Set(["pdf"]);
const SCHEDULING_CHANGED_EVENT = "client:scheduling:changed";
const CONSULTATION_SERVICE_LABEL = "Consultation";
const APPOINTMENTS_PAGE_SIZE = 10;
const PROCESSING_DOCUMENT_OPTIONS = [
  { value: "business_permit", label: "Business Permit" },
  { value: "dti", label: "DTI" },
  { value: "sec", label: "SEC" },
  { value: "bir", label: "BIR" },
  { value: "philhealth", label: "PhilHealth" },
  { value: "pag_ibig", label: "Pag-IBIG" },
  { value: "sss", label: "SSS" },
];
const PROCESSING_DOCUMENT_KEYS = new Set(
  PROCESSING_DOCUMENT_OPTIONS.map((option) => option.value)
);

function readMetaLine(text, key) {
  const source = String(text || "");
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*([^\\r\\n]*)\\s*$`, "im");
  const match = source.match(re);
  return match ? String(match[1] || "").trim() : "";
}

function isConsultationService(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .startsWith("consult");
}

function isProcessingService(value) {
  return String(value || "").trim().toLowerCase() === "processing";
}

function isConsultationTopicService(value) {
  const normalized = String(value || "").trim();
  return normalized !== "" && !isConsultationService(normalized) && !isProcessingService(normalized);
}

function getServiceRestrictionMessage(access = DEFAULT_SERVICE_ACCESS) {
  if (access?.businessPermitExpired || access?.restrictionReason === "expired") {
    return "Your Business Permit has expired. Tax Filing, Auditing, Bookkeeping, and Consultation are disabled until your permit is renewed. Only Processing is available for renewal.";
  }
  if (access?.restrictedToProcessing) {
    return "Processing is the only available service until your business is registered.";
  }
  return "";
}

function normalizeProcessingDocumentSelection(values) {
  if (!Array.isArray(values)) return [];
  const selected = new Set(
    values
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => PROCESSING_DOCUMENT_KEYS.has(value))
  );

  return PROCESSING_DOCUMENT_OPTIONS.map((option) => option.value).filter((value) =>
    selected.has(value)
  );
}

function normalizeAppointmentStatus(value) {
  const status = String(value || "").trim();
  if (!status) return "Pending";

  const lower = status.toLowerCase();
  if (lower === "active") return "Approved";
  if (lower === "cancelled" || lower === "canceled") return "Declined";
  return status;
}

function getAppointmentRowStatus(row) {
  return normalizeAppointmentStatus(
    row?.status || row?.Status || row?.Status_name || row?.status_name || "Pending"
  );
}

function getAppointmentRowSortRank(row) {
  const status = getAppointmentRowStatus(row).toLowerCase();
  if (status === "pending") return 0;
  if (status === "approved") return 2;
  return 1;
}

function getAppointmentRowCreatedSortValue(row) {
  const createdAt = Date.parse(
    row?.created_at ||
      row?.createdAt ||
      row?.date_created ||
      row?.created_on ||
      readMetaLine(row?.description || row?.Description, "CreatedAt") ||
      row?.timestamp ||
      ""
  );
  if (!Number.isNaN(createdAt) && createdAt > 0) {
    return createdAt;
  }

  const recordId =
    row?.Appointment_ID ??
    row?.appointment_id ??
    row?.Consultation_ID ??
    row?.consultation_id ??
    row?.Scheduling_ID ??
    row?.scheduling_id ??
    row?.schedulingId ??
    row?.id ??
    0;

  const numericId = Number(recordId);
  return Number.isFinite(numericId) ? numericId : 0;
}

function canRescheduleConsultation(status) {
  const value = normalizeAppointmentStatus(status).toLowerCase();
  return value !== "declined" && value !== "completed";
}

function getActionAvailabilityLabel(status) {
  const value = normalizeAppointmentStatus(status).toLowerCase();
  if (value === "completed") return "Completed";
  return "Unavailable";
}

function normalizePaymentStatus(value) {
  const status = String(value || "").trim();
  return status || "Pending";
}

function getPaymentStatusBadgeClass(status, hasPaymentRecord = false) {
  const value = normalizePaymentStatus(status).toLowerCase();

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

function getAvailableConsultationSlots(
  consultationAvailability,
  dateValue,
  configuredSlots = DEFAULT_CONSULTATION_TIME_SLOTS,
  excludeSchedulingId = null
) {
  if (!dateValue) return [];

  const excludedId =
    excludeSchedulingId == null ? "" : String(excludeSchedulingId);

  const occupiedSlots = new Set(
    consultationAvailability
      .filter((row) => {
        const status = String(row.status || "").trim().toLowerCase();
        const schedulingId =
          row.schedulingId == null ? "" : String(row.schedulingId);

        return (
          row.date === dateValue &&
          row.time !== "" &&
          status !== "declined" &&
          status !== "cancelled" &&
          status !== "canceled" &&
          (!excludedId || schedulingId !== excludedId)
        );
      })
      .map((row) => row.time)
  );

  return configuredSlots.filter((slot) => !occupiedSlots.has(slot));
}

function toTimeLabel(value) {
  return toConsultationTimeLabel(value);
}

function toDateTimeSortValue(dateValue, timeValue) {
  const date = String(dateValue || "").slice(0, 10);
  if (!date) return 0;

  const time = /^\d{2}:\d{2}$/.test(String(timeValue || ""))
    ? String(timeValue)
    : "00:00";
  const parsed = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function ConsultationSlotPicker({
  value,
  options,
  disabled,
  loading,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled || loading || options.length === 0) {
      setOpen(false);
    }
  }, [disabled, loading, options.length]);

  const buttonLabel = value
    ? toTimeLabel(value)
    : !disabled && !loading && options.length > 0
      ? "Select a consultation slot"
      : !disabled && !loading && options.length === 0
        ? "No slots available"
        : !disabled && loading
          ? "Loading available slots..."
          : "Select a date first";

  return (
    <div ref={rootRef} className="space-y-2">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{buttonLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="rounded-md border border-slate-300 bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1" role="listbox">
            {options.map((slot) => {
              const selected = slot === value;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    onSelect(slot);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "bg-indigo-600 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                  role="option"
                  aria-selected={selected}
                >
                  {toTimeLabel(slot)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fileExtension(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw.split("?")[0].split("#")[0];
  const idx = cleaned.lastIndexOf(".");
  if (idx < 0) return "";
  return cleaned.slice(idx + 1).toLowerCase();
}

function validateAttachment(file) {
  if (!file) return "";

  if (Number(file.size || 0) > ATTACHMENT_MAX_BYTES) {
    return "File is too large. Maximum size is 10MB.";
  }

  const ext = String(file.name || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
    return "Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, JPEG, PNG, GIF, WEBP.";
  }

  return "";
}

function validateAttachments(files) {
  if (!Array.isArray(files) || files.length === 0) return "";

  for (const file of files) {
    const validationError = validateAttachment(file);
    if (validationError) {
      const filename = String(file?.name || "File");
      return `${filename}: ${validationError}`;
    }
  }

  return "";
}

function toAppointmentFileUrl(path, options = {}) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const disposition =
    String(options?.disposition || "").trim().toLowerCase() === "attachment"
      ? "attachment"
      : "inline";
  const filename = String(options?.filename || "").trim();
  const base = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
  if (!base) return raw;

  const params = new URLSearchParams();
  params.set("path", raw);
  params.set("disposition", disposition);
  if (filename) params.set("name", filename);
  return `${base}/appointment_file.php?${params.toString()}`;
}

function toBackendFileUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const normalized = raw.replace(/^\/+/, "");
  const base = String(api?.defaults?.baseURL || "").replace(/\/+$/, "");
  if (!base) return normalized;

  if (/^backend\//i.test(normalized)) {
    const appBase = base.replace(/\/backend\/api$/i, "");
    return `${appBase}/${normalized}`;
  }

  const backendBase = base.replace(/\/api$/i, "");
  return `${backendBase}/${normalized}`;
}

function toOpenFileUrl(path, filename) {
  const inlineUrl = toAppointmentFileUrl(path, {
    disposition: "inline",
    filename,
  });
  const ext = fileExtension(filename || path);
  const isWord = WORD_EXT.has(ext);
  const isExcel = EXCEL_EXT.has(ext);
  const isPdf = PDF_EXT.has(ext);

  if (!isWord && !isExcel && !isPdf) {
    return inlineUrl;
  }

  const directUrl = toBackendFileUrl(path);
  const targetUrl = directUrl || inlineUrl;
  const protocol = isWord ? "ms-word" : "ms-excel";

  if (isPdf) {
    return targetUrl;
  }

  try {
    const parsed = new URL(targetUrl, window.location.origin);
    const httpProtocol = String(parsed.protocol || "").toLowerCase();
    if (httpProtocol === "http:" || httpProtocol === "https:") {
      return `${protocol}:ofe|u|${encodeURI(parsed.href)}`;
    }
  } catch (_) {
    return `${protocol}:ofe|u|${encodeURI(targetUrl)}`;
  }

  return inlineUrl;
}

export default function ClientAppointment() {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const isCreateOpenRef = useRef(false);
  const isRescheduleOpenRef = useRef(false);
  const hasLoadedServicesRef = useRef(false);
  const serviceAccessRef = useRef(DEFAULT_SERVICE_ACCESS);
  const [services, setServices] = useState([]);
  const [portalConfig, setPortalConfig] = useState(DEFAULT_SYSTEM_CONFIGURATION);
  const [serviceAccess, setServiceAccess] = useState(DEFAULT_SERVICE_ACCESS);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [consultationAvailability, setConsultationAvailability] = useState([]);
  const [consultationSlots, setConsultationSlots] = useState([]);
  const [loadingConsultationSlots, setLoadingConsultationSlots] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [success, setSuccess] = useState("");

  const [appointments, setAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    date: "",
    time: "",
    reason: "",
  });

  const user = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }, []);

  const [form, setForm] = useState({
    service: "",
    consultation_service: "",
    processing_documents: [],
    meeting_type: "Online",
    date: "",
    time: "",
    notes: "",
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const isConsultationSelected = useMemo(
    () => isConsultationService(form.service),
    [form.service]
  );
  const isProcessingSelected = useMemo(
    () => !isConsultationSelected && isProcessingService(form.service),
    [form.service, isConsultationSelected]
  );
  const appointmentsEnabled = portalConfig.allowClientAppointments !== false;
  const consultationsEnabled = portalConfig.allowClientConsultations !== false;
  const supportEmail = String(portalConfig.supportEmail || "").trim();
  const portalNotice = String(portalConfig.systemNotice || "").trim();
  const bookingPausedMessage =
    appointmentsEnabled || consultationsEnabled
      ? ""
      : `Appointment and consultation requests are currently unavailable.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`;
  const serviceRestrictionMessage = getServiceRestrictionMessage(serviceAccess);
  const selectedServiceDuration = useMemo(
    () =>
      isConsultationSelected
        ? ""
        : getEstimatedServiceDuration(form.service),
    [form.service, isConsultationSelected]
  );
  const appointmentTotalPages = Math.max(1, Math.ceil(appointments.length / APPOINTMENTS_PAGE_SIZE));
  const appointmentStartIndex = (appointmentPage - 1) * APPOINTMENTS_PAGE_SIZE;
  const pagedAppointments = useMemo(
    () => appointments.slice(appointmentStartIndex, appointmentStartIndex + APPOINTMENTS_PAGE_SIZE),
    [appointmentStartIndex, appointments]
  );
  const canGoToPreviousAppointmentPage = appointmentPage > 1;
  const canGoToNextAppointmentPage = appointmentPage < appointmentTotalPages;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    isCreateOpenRef.current = isCreateOpen;
  }, [isCreateOpen]);

  useEffect(() => {
    isRescheduleOpenRef.current = isRescheduleOpen;
  }, [isRescheduleOpen]);

  useEffect(() => {
    serviceAccessRef.current = serviceAccess;
  }, [serviceAccess]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadPortalConfiguration = async () => {
      try {
        const response = await fetchPublicSystemConfiguration({ signal: controller.signal });
        if (!active) return;
        setPortalConfig(response?.data?.settings || DEFAULT_SYSTEM_CONFIGURATION);
      } catch (_) {
        if (!active) return;
        setPortalConfig(DEFAULT_SYSTEM_CONFIGURATION);
      }
    };

    loadPortalConfiguration();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setAppointmentPage((page) => Math.min(Math.max(1, page), appointmentTotalPages));
  }, [appointmentTotalPages]);

  const applyServiceOptions = (names, nextAccess = DEFAULT_SERVICE_ACCESS) => {
    if (!isMountedRef.current) return;

    const normalizedAccess = {
      businessRegistered:
        nextAccess?.businessRegistered === true
          ? true
          : nextAccess?.businessRegistered === false
            ? false
            : null,
      businessPermitExpired: Boolean(nextAccess?.businessPermitExpired),
      restrictedToProcessing: Boolean(nextAccess?.restrictedToProcessing),
      restrictionReason: String(nextAccess?.restrictionReason || "").trim() || null,
    };
    const baseNames = Array.isArray(names) ? names.filter(Boolean) : [];
    const fallbackNames = normalizedAccess.restrictedToProcessing
      ? ["Processing"]
      : [];
    const unique = Array.from(
      new Set([...(baseNames.length ? baseNames : fallbackNames)])
    );
    const nextServices = normalizedAccess.restrictedToProcessing
      ? unique.filter((name) => isProcessingService(name))
      : unique;
    const resolvedServices = nextServices.length > 0
      ? nextServices
      : normalizedAccess.restrictedToProcessing
        ? ["Processing"]
        : [];
    const consultationServices = resolvedServices.filter((name) =>
      isConsultationTopicService(name)
    );
    const nextAvailableServiceOptions = [];

    if (portalConfig?.allowClientAppointments !== false) {
      nextAvailableServiceOptions.push(...resolvedServices);
    }
    if (
      portalConfig?.allowClientConsultations !== false &&
      !normalizedAccess.restrictedToProcessing &&
      !normalizedAccess.businessPermitExpired &&
      consultationServices.length > 0
    ) {
      nextAvailableServiceOptions.push(CONSULTATION_SERVICE_LABEL);
    }

    setServiceAccess(normalizedAccess);
    setServices(resolvedServices);
    setForm((current) => ({
      ...current,
      service: nextAvailableServiceOptions.includes(current.service)
        ? current.service
        : nextAvailableServiceOptions[0] || "",
      consultation_service: consultationServices.includes(current.consultation_service)
        ? current.consultation_service
        : consultationServices[0] || "",
      processing_documents: isProcessingService(
        nextAvailableServiceOptions.includes(current.service)
          ? current.service
          : nextAvailableServiceOptions[0] || ""
      )
        ? normalizeProcessingDocumentSelection(current.processing_documents)
        : [],
    }));
  };

  const consultationServiceOptions = useMemo(
    () => services.filter((serviceName) => isConsultationTopicService(serviceName)),
    [services]
  );

  const availableServiceOptions = useMemo(() => {
    const options = [];

    if (appointmentsEnabled) {
      options.push(...services);
    }
    if (
      consultationsEnabled &&
      !serviceAccess.restrictedToProcessing &&
      !serviceAccess.businessPermitExpired &&
      consultationServiceOptions.length > 0
    ) {
      options.push(CONSULTATION_SERVICE_LABEL);
    }

    return Array.from(new Set(options));
  }, [
    appointmentsEnabled,
    consultationServiceOptions.length,
    consultationsEnabled,
    serviceAccess.businessPermitExpired,
    serviceAccess.restrictedToProcessing,
    services,
  ]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      service: availableServiceOptions.includes(current.service)
        ? current.service
        : availableServiceOptions[0] || "",
      consultation_service: consultationServiceOptions.includes(current.consultation_service)
        ? current.consultation_service
        : consultationServiceOptions[0] || "",
      processing_documents: isProcessingService(
        availableServiceOptions.includes(current.service)
          ? current.service
          : availableServiceOptions[0] || ""
      )
        ? normalizeProcessingDocumentSelection(current.processing_documents)
        : [],
    }));
  }, [availableServiceOptions, consultationServiceOptions]);

  const loadServices = async ({ silent } = { silent: false }) => {
    try {
      if (isMountedRef.current && !silent && !hasLoadedServicesRef.current) {
        setLoadingServices(true);
      }

      const res = await fetchAvailableServices(
        user?.client_id || user?.Client_ID || "",
        { timeout: 12000 }
      );
      if (!isMountedRef.current) return;

      const rows = res?.data?.services || res?.data || [];
      const list = Array.isArray(rows)
        ? rows
            .map((s) => (typeof s === "string" ? s : s?.Name || s?.name))
            .filter(Boolean)
        : [];
      const accessMeta = res?.data?.service_access || {};

      applyServiceOptions(list, {
        businessRegistered:
          accessMeta?.business_registered === true
            ? true
            : accessMeta?.business_registered === false
              ? false
              : null,
        businessPermitExpired: Boolean(accessMeta?.business_permit_expired),
        restrictedToProcessing: Boolean(accessMeta?.restricted_to_processing),
        restrictionReason: String(accessMeta?.restriction_reason || "").trim() || null,
      });
      hasLoadedServicesRef.current = true;
    } catch (requestError) {
      if (!silent && !hasLoadedServicesRef.current) {
        applyServiceOptions([], serviceAccessRef.current);
      }
      if (isMountedRef.current && isCreateOpenRef.current && !silent && !hasLoadedServicesRef.current) {
        setError(
          requestError?.response?.data?.message ||
            "Unable to load services right now. Please try again."
        );
      }
    } finally {
      if (isMountedRef.current && !silent) {
        setLoadingServices(false);
      }
    }
  };

  useEffect(() => {
    void loadServices({ silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCreateOpen) return;
    void loadServices({ silent: hasLoadedServicesRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateOpen]);

  useEffect(() => {
    const refreshServices = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      void loadServices({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        refreshServices();
      }
    };

    const intervalId = window.setInterval(
      refreshServices,
      isCreateOpen ? 5000 : 15000
    );
    window.addEventListener("focus", refreshServices);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshServices);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateOpen, user?.client_id, user?.Client_ID]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((current) => ({
      ...current,
      [name]: value,
      processing_documents:
        name === "service" && !isProcessingService(value)
          ? []
          : current.processing_documents,
    }));
  };

  const onToggleProcessingDocument = (value) => {
    setForm((current) => {
      const nextSelection = new Set(
        normalizeProcessingDocumentSelection(current.processing_documents)
      );

      if (nextSelection.has(value)) {
        nextSelection.delete(value);
      } else if (PROCESSING_DOCUMENT_KEYS.has(value)) {
        nextSelection.add(value);
      }

      return {
        ...current,
        processing_documents: normalizeProcessingDocumentSelection(
          Array.from(nextSelection)
        ),
      };
    });
  };

  const onFormFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      setSelectedFiles([]);
      return;
    }

    const validationError = validateAttachments(files);
    if (validationError) {
      setError(validationError);
      setSelectedFiles([]);
      e.target.value = "";
      return;
    }

    setError("");
    setSelectedFiles(files);
  };

  const loadConsultationAvailability = async (
    { silent } = { silent: false }
  ) => {
    try {
      if (!silent) setLoadingConsultationSlots(true);
      const [res, slotResponse] = await Promise.all([
        api.get("/scheduling_list.php"),
        fetchConsultationSlots().catch(() => ({ data: { slots: [] } })),
      ]);
      const list = res?.data?.rows || res?.data?.scheduling || res?.data || [];
      const rows = Array.isArray(list) ? list : [];

      const normalized = rows
        .map((row) => {
          const description = String(row?.Description ?? row?.description ?? "");
          const serviceName =
            row?.Consultation_Service ??
            row?.consultation_service ??
            row?.Name ??
            row?.service ??
            row?.service_name ??
            readMetaLine(description, "Service") ??
            "";
          const date = row?.Date ?? row?.date ?? "";
          const time = row?.Time ?? row?.time ?? readMetaLine(description, "Time");
          const status =
            row?.Status ?? row?.status ?? row?.Status_name ?? row?.status_name ?? "";

          return {
            schedulingId:
              row?.Consultation_ID ??
              row?.consultation_id ??
              row?.Scheduling_ID ??
              row?.scheduling_id ??
              row?.SchedulingId ??
              row?.id,
            service: String(serviceName || ""),
            date: date ? String(date).slice(0, 10) : "",
            time: time ? String(time).slice(0, 5) : "",
            status: String(status || ""),
          };
        })
        .filter((row) => row.date !== "" && row.time !== "");

      setConsultationAvailability(normalized);
      setConsultationSlots(slotResponse?.data?.slots || []);
    } catch (_) {
      setConsultationAvailability([]);
      setConsultationSlots([]);
    } finally {
      if (!silent) setLoadingConsultationSlots(false);
    }
  };

  const openCreateModal = () => {
    setError("");
    setSuccess("");
    if (!appointmentsEnabled && !consultationsEnabled) {
      setError(bookingPausedMessage || "Appointment and consultation requests are currently unavailable.");
      return;
    }
    if (availableServiceOptions.length === 0 && !loadingServices) {
      setError(
        serviceRestrictionMessage ||
          "No services are available for your account right now."
      );
      return;
    }
    if (
      isMountedRef.current &&
      !hasLoadedServicesRef.current &&
      (!Array.isArray(services) || services.length === 0)
    ) {
      setLoadingServices(true);
    }
    setServices((current) =>
      Array.isArray(current) && current.length > 0
        ? current
        : serviceAccess.restrictedToProcessing
          ? ["Processing"]
          : []
    );
    setIsCreateOpen(true);
  };

  const closeCreateModal = () => {
    if (submitting) return;
    setError("");
    setSelectedFiles([]);
    setIsCreateOpen(false);
  };

  const openRescheduleModal = (consultation) => {
    setError("");
    setSuccess("");
    setRescheduleTarget(consultation);
    setRescheduleForm({
      date: consultation?.date || "",
      time: consultation?.time || "",
      reason:
        consultation?.reschedule_reason ||
        consultation?.Reschedule_Reason ||
        "",
    });
    setIsRescheduleOpen(true);
  };

  const closeRescheduleModal = () => {
    if (rescheduling) return;
    setError("");
    setRescheduleTarget(null);
    setRescheduleForm({ date: "", time: "", reason: "" });
    setIsRescheduleOpen(false);
  };

  useEffect(() => {
    if (!isCreateOpen || !isConsultationSelected) return;
    loadConsultationAvailability({ silent: false });
  }, [isCreateOpen, isConsultationSelected]);

  useEffect(() => {
    if (!isRescheduleOpen) return;
    loadConsultationAvailability({ silent: false });
  }, [isRescheduleOpen]);

  useEffect(() => {
    if (!isConsultationSelected) return;
    if (selectedFiles.length === 0) return;
    setSelectedFiles([]);
  }, [isConsultationSelected, selectedFiles.length]);

  const hasManagedConsultationSlots = useMemo(
    () => hasConfiguredConsultationSlots(consultationSlots),
    [consultationSlots]
  );

  const configuredConsultationSlotsForDate = useMemo(
    () => getConfiguredConsultationTimesForDate(consultationSlots, form.date),
    [consultationSlots, form.date]
  );

  const configuredRescheduleSlotsForDate = useMemo(
    () => getConfiguredConsultationTimesForDate(consultationSlots, rescheduleForm.date),
    [consultationSlots, rescheduleForm.date]
  );

  const availableConsultationSlots = useMemo(
    () =>
      getAvailableConsultationSlots(
        consultationAvailability,
        form.date,
        hasManagedConsultationSlots
          ? configuredConsultationSlotsForDate
          : DEFAULT_CONSULTATION_TIME_SLOTS
      ),
    [
      configuredConsultationSlotsForDate,
      consultationAvailability,
      form.date,
      hasManagedConsultationSlots,
    ]
  );

  const availableRescheduleSlots = useMemo(
    () =>
      getAvailableConsultationSlots(
        consultationAvailability,
        rescheduleForm.date,
        hasManagedConsultationSlots
          ? configuredRescheduleSlotsForDate
          : DEFAULT_CONSULTATION_TIME_SLOTS,
        rescheduleTarget?.schedulingId
      ),
    [
      configuredRescheduleSlotsForDate,
      consultationAvailability,
      hasManagedConsultationSlots,
      rescheduleForm.date,
      rescheduleTarget?.schedulingId,
    ]
  );

  useEffect(() => {
    if (!isConsultationSelected) return;

    setForm((current) => {
      if (!current.time) return current;
      if (current.date && availableConsultationSlots.includes(current.time)) {
        return current;
      }
      return { ...current, time: "" };
    });
  }, [availableConsultationSlots, isConsultationSelected]);

  useEffect(() => {
    if (!isRescheduleOpen) return;

    setRescheduleForm((current) => {
      if (!current.time) return current;
      if (
        current.date &&
        availableRescheduleSlots.includes(String(current.time || "").slice(0, 5))
      ) {
        return current;
      }
      return { ...current, time: "" };
    });
  }, [availableRescheduleSlots, isRescheduleOpen]);

  const refreshAppointments = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoadingAppointments(true);
      const queryParams = {
        client_id: user?.client_id || user?.Client_ID || undefined,
        client_username: user?.username || undefined,
      };

      const [appointmentRes, consultationRes] = await Promise.all([
        api.get("/appointment_list.php", { params: queryParams }),
        api.get("/scheduling_list.php", { params: queryParams }),
      ]);

      const appointmentList =
        appointmentRes?.data?.appointments ||
        appointmentRes?.data?.rows ||
        appointmentRes?.data ||
        [];
      const consultationList =
        consultationRes?.data?.rows ||
        consultationRes?.data?.scheduling ||
        consultationRes?.data ||
        [];

      const appointmentRows = Array.isArray(appointmentList) ? appointmentList : [];
      const consultationRows = Array.isArray(consultationList)
        ? consultationList
        : [];

      // Some backends may not filter by client params; do a best-effort client-side filter.
      const myId = user?.client_id || user?.Client_ID;
      const myUsername = user?.username;
      const myFullName = joinPersonName([
        user?.first_name || user?.First_Name,
        user?.middle_name || user?.Middle_Name,
        user?.last_name || user?.Last_Name,
      ]);

      // If the backend already returns ONLY the current client's rows,
      // filtering too aggressively can hide results. We'll try to match first,
      // but fall back to showing all approved rows if nothing matches.
      const matchesUser = (a) => {
        const cid = a.client_id || a.Client_ID || a.clientId || a.clientID;
        const cun =
          a.client_username ||
          a.clientUsername ||
          a.client_user ||
          a.clientUser;
        const cemail = a.client_email || a.clientEmail;
        const cname = a.client_name || a.Client_name || a.Client_Name;

        if (myId != null && cid != null && String(cid) === String(myId))
          return true;
        if (
          myUsername &&
          cun &&
          String(cun).toLowerCase() === String(myUsername).toLowerCase()
        )
          return true;
        if (
          user?.email &&
          cemail &&
          String(cemail).toLowerCase() === String(user.email).toLowerCase()
        )
          return true;
        if (
          myFullName &&
          cname &&
          normalizeNameForComparison(cname) === normalizeNameForComparison(myFullName)
        )
          return true;
        return false;
      };

      const appointmentMatches = appointmentRows.filter(matchesUser);
      const consultationMatches = consultationRows.filter(matchesUser);

      const selectedAppointments = appointmentMatches.length
        ? appointmentMatches
        : appointmentRows;
      const selectedConsultations = consultationMatches.length
        ? consultationMatches
        : consultationRows;

      const combined = [
        ...selectedAppointments.map((row) => ({
          ...row,
          record_kind: "appointment",
        })),
        ...selectedConsultations.map((row) => ({
          ...row,
          record_kind: "consultation",
        })),
      ].sort((left, right) => {
        const leftTime =
          left.time ||
          left.Time ||
          readMetaLine(left.description || left.Description, "Time");
        const rightTime =
          right.time ||
          right.Time ||
          readMetaLine(right.description || right.Description, "Time");

        const leftRank = getAppointmentRowSortRank(left);
        const rightRank = getAppointmentRowSortRank(right);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        const leftCreated = getAppointmentRowCreatedSortValue(left);
        const rightCreated = getAppointmentRowCreatedSortValue(right);
        if (leftCreated !== rightCreated) {
          return rightCreated - leftCreated;
        }

        return (
          toDateTimeSortValue(right.date || right.Date, rightTime) -
          toDateTimeSortValue(left.date || left.Date, leftTime)
        );
      });

      setAppointments(combined);
    } catch (_) {
      setAppointments([]);
    } finally {
      if (!silent) setLoadingAppointments(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await refreshAppointments({ silent: false });
    })();

    // Poll faster so approvals reflect almost immediately
    const intv = setInterval(() => {
      if (mounted && !isCreateOpenRef.current && !isRescheduleOpenRef.current) {
        refreshAppointments({ silent: true });
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.client_id, user?.Client_ID, user?.username]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const selectedBookingService = isConsultationSelected
      ? form.consultation_service
      : form.service;

    if (isConsultationSelected && !consultationsEnabled) {
      setError(
        `Consultation requests are currently unavailable.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`
      );
      return;
    }

    if (!isConsultationSelected && !appointmentsEnabled) {
      setError(
        `Appointment requests are currently unavailable.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`
      );
      return;
    }

    if (loadingServices) {
      setError("Please wait while the available services are loading.");
      return;
    }

    if (
      (serviceAccess.businessPermitExpired || serviceAccess.restrictedToProcessing) &&
      (isConsultationSelected || !isProcessingService(selectedBookingService))
    ) {
      setError(serviceRestrictionMessage);
      return;
    }

    if (availableServiceOptions.length === 0) {
      setError("No services are available right now. Please try again.");
      return;
    }

    if (!selectedBookingService || !form.date || !form.time) {
      setError(
        isConsultationSelected
          ? "Please select the service to consult, date, and consultation time slot."
          : "Please select a service and choose date/time."
      );
      return;
    }

    if (isProcessingSelected && form.processing_documents.length === 0) {
      setError("Please select at least one document to process.");
      return;
    }

    if (
      isConsultationSelected &&
      !availableConsultationSlots.includes(String(form.time || "").slice(0, 5))
    ) {
      setError("Please choose an available consultation time slot.");
      return;
    }

    if (!isConsultationSelected && selectedFiles.length > 0) {
      const validationError = validateAttachments(selectedFiles);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    try {
      setSubmitting(true);

      const payload = {
        // Prefer client id if present; otherwise pass username so backend can resolve.
        client_id: user?.client_id || user?.Client_ID || null,
        client_username: user?.username || null,
        service: form.service,
        consultation_service: isConsultationSelected ? form.consultation_service : null,
        processing_documents: isProcessingSelected
          ? normalizeProcessingDocumentSelection(form.processing_documents)
          : [],
        appointment_type: isConsultationSelected ? "Consultation" : "Service",
        meeting_type: form.meeting_type, // Online | Onsite
        date: form.date,
        time: form.time,
        notes: form.notes || null,
      };

      const endpoint = isConsultationSelected
        ? "/scheduling_create.php"
        : "/appointment_create.php";
      const res = await api.post(endpoint, payload);
      if (res?.data?.success) {
        const newAppointmentId =
          !isConsultationSelected
            ? res?.data?.appointment?.id ||
              res?.data?.appointment?.Appointment_ID ||
              res?.data?.Appointment_ID ||
              res?.data?.id ||
              null
            : null;

        let successMessage = isConsultationSelected
          ? "Consultation request submitted."
          : "Appointment request submitted.";
        let uploadWarning = "";

        if (!isConsultationSelected && selectedFiles.length > 0) {
          if (!newAppointmentId) {
            uploadWarning =
              "Appointment submitted, but attachment could not be linked (missing appointment ID).";
          } else {
            let uploadedCount = 0;
            const failedUploads = [];

            for (const file of selectedFiles) {
              try {
                const fd = new FormData();
                fd.append("appointment_id", String(newAppointmentId));
                fd.append("file", file);

                const uploadRes = await api.post("/appointment_upload_file.php", fd, {
                  headers: { "Content-Type": "multipart/form-data" },
                });

                if (uploadRes?.data?.success) {
                  uploadedCount += 1;
                } else {
                  failedUploads.push(
                    `${file.name}: ${uploadRes?.data?.message || "Attachment upload failed."}`
                  );
                }
              } catch (uploadErr) {
                failedUploads.push(
                  `${file.name}: ${uploadErr?.response?.data?.message || "Attachment upload failed."}`
                );
              }
            }

            if (uploadedCount > 0) {
              successMessage =
                uploadedCount === selectedFiles.length
                  ? `Appointment request submitted with ${uploadedCount} attachment${uploadedCount === 1 ? "" : "s"}.`
                  : `Appointment request submitted. Uploaded ${uploadedCount} of ${selectedFiles.length} attachments.`;
            }

            if (failedUploads.length > 0) {
              const preview = failedUploads.slice(0, 2).join(" | ");
              const suffix =
                failedUploads.length > 2 ? ` (+${failedUploads.length - 2} more)` : "";
              uploadWarning = `Some attachments failed: ${preview}${suffix}`;
            }
          }
        }

        showSuccessToast(successMessage);
        if (uploadWarning) {
          showErrorToast({
            title: "Attachment upload issue",
            description: uploadWarning,
            duration: 3600,
          });
        }
        setForm((f) => ({
          ...f,
          date: "",
          time: "",
          notes: "",
          processing_documents: [],
        }));
        setSelectedFiles([]);
        if (isConsultationSelected) {
          await loadConsultationAvailability({ silent: true });
          await refreshAppointments({ silent: true });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event(SCHEDULING_CHANGED_EVENT));
          }
        } else {
          await refreshAppointments({ silent: true });
        }
        setIsCreateOpen(false);
        if (!isConsultationSelected && newAppointmentId) {
          navigate(`/client/payment?appointment_id=${encodeURIComponent(String(newAppointmentId))}`);
        }
      } else {
        showErrorToast({
          title: isConsultationSelected ? "Consultation request failed" : "Appointment request failed",
          description:
            res?.data?.message ||
            (isConsultationSelected
              ? "Failed to submit consultation request."
              : "Failed to submit appointment request."),
        });
      }
    } catch (err) {
      showErrorToast({
        title: isConsultationSelected ? "Consultation request failed" : "Appointment request failed",
        description:
          err?.response?.data?.message ||
          err?.message ||
          (isConsultationSelected
            ? "Consultation request endpoint is not available yet (scheduling_create.php)."
            : "Appointment request endpoint is not available yet (appointment_create.php)."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onRescheduleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!consultationsEnabled) {
      setError(
        `Consultation rescheduling is currently unavailable.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`
      );
      return;
    }

    if (serviceAccess.businessPermitExpired) {
      setError(serviceRestrictionMessage);
      return;
    }

    if (!rescheduleTarget?.schedulingId) {
      setError("Cannot reschedule: missing consultation id.");
      return;
    }

    if (!rescheduleForm.date || !rescheduleForm.time) {
      setError("Please choose a new consultation date and time slot.");
      return;
    }
    if (!String(rescheduleForm.reason || "").trim()) {
      setError("Please add a reason for rescheduling.");
      return;
    }

    const nextTime = String(rescheduleForm.time || "").slice(0, 5);
    if (!availableRescheduleSlots.includes(nextTime)) {
      setError("Please choose an available consultation time slot.");
      return;
    }

    try {
      setRescheduling(true);

      const res = await api.post("/scheduling_reschedule.php", {
        scheduling_id: rescheduleTarget.schedulingId,
        client_id: user?.client_id || user?.Client_ID || null,
        client_username: user?.username || null,
        date: rescheduleForm.date,
        time: nextTime,
        reason: String(rescheduleForm.reason || "").trim(),
      });

      if (!res?.data?.success) {
        throw new Error(
          res?.data?.message || "Failed to reschedule consultation."
        );
      }

      setSuccess(
        res?.data?.message ||
          "Consultation rescheduled. The update is pending confirmation."
      );
      setRescheduleTarget(null);
      setRescheduleForm({ date: "", time: "", reason: "" });
      setIsRescheduleOpen(false);
      await loadConsultationAvailability({ silent: true });
      await refreshAppointments({ silent: true });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(SCHEDULING_CHANGED_EVENT));
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Consultation reschedule endpoint is not available yet (scheduling_reschedule.php)."
      );
    } finally {
      setRescheduling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Appointment</h2>
            <p className="text-sm text-slate-500">
              Book a service appointment or request a consultation.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!appointmentsEnabled && !consultationsEnabled}
            className="inline-flex items-center justify-center self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Create
          </button>
        </div>

        {bookingPausedMessage ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {bookingPausedMessage}
          </div>
        ) : null}
        {!bookingPausedMessage && serviceAccess.businessPermitExpired ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {serviceRestrictionMessage}
          </div>
        ) : null}
        {!bookingPausedMessage && (!appointmentsEnabled || !consultationsEnabled) ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {!appointmentsEnabled
              ? `Service appointments are paused.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`
              : `Consultation requests are paused.${supportEmail ? ` Please contact ${supportEmail}.` : ""}`}
          </div>
        ) : null}
        {portalNotice ? (
          <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
            {portalNotice}
          </div>
        ) : null}

        {!isCreateOpen && success ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}
        {!isCreateOpen && error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <Modal
        open={isCreateOpen}
        onClose={closeCreateModal}
        title="Create Appointment"
        description="Fill out the details below to submit a new appointment request."
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}
          {serviceAccess.restrictedToProcessing ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {serviceRestrictionMessage}
            </div>
          ) : null}
          {portalNotice ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-700">
              {portalNotice}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Services
              </label>
              <select
                name="service"
                value={form.service}
                onChange={onChange}
                disabled={loadingServices || availableServiceOptions.length === 0}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                required
              >
                {availableServiceOptions.length === 0 ? (
                  <option value="">
                    {loadingServices
                      ? "Loading available services..."
                      : "No services available"}
                  </option>
                ) : null}
                {availableServiceOptions.map((serviceName) => (
                  <option key={serviceName} value={serviceName}>
                    {serviceName}
                  </option>
                ))}
              </select>
              {loadingServices ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Checking the services available for your business...
                </p>
              ) : null}
              {selectedServiceDuration ? (
                <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Estimated duration
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {selectedServiceDuration}
                  </div>
                </div>
              ) : null}
              <p className="mt-1 text-[11px] text-slate-500">
                {loadingServices
                  ? "Please wait while the available services are being loaded."
                  : serviceAccess.restrictedToProcessing
                  ? serviceRestrictionMessage
                  : availableServiceOptions.length === 0
                    ? "No services are available right now. Please try again in a moment."
                    : "Choose the service you want to book."}
              </p>
            </div>

            {isConsultationSelected ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Service To Consult
                </label>
                <select
                  name="consultation_service"
                  value={form.consultation_service}
                  onChange={onChange}
                  disabled={loadingServices || consultationServiceOptions.length === 0}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {consultationServiceOptions.length === 0 ? (
                    <option value="">
                      {loadingServices
                        ? "Loading available services..."
                        : "No consultation services available"}
                    </option>
                  ) : null}
                  {consultationServiceOptions.map((serviceName) => (
                    <option key={serviceName} value={serviceName}>
                      {serviceName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Choose which service you want to discuss during the consultation.
                </p>
              </div>
            ) : null}

            {isProcessingSelected ? (
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Documents To Process
                </label>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  {PROCESSING_DOCUMENT_OPTIONS.map((option) => {
                    const checked = form.processing_documents.includes(option.value);

                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleProcessingDocument(option.value)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Select all documents you want us to process for this appointment.
                </p>
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Appointment Type
              </label>
              <select
                name="meeting_type"
                value={form.meeting_type}
                onChange={onChange}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Online">Online</option>
                <option value="Onsite">Onsite</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Choose how you want to attend.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Date
              </label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={onChange}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Time
              </label>
              {isConsultationSelected ? (
                <>
                  <ConsultationSlotPicker
                    value={form.time}
                    options={availableConsultationSlots}
                    disabled={!form.date}
                    loading={loadingConsultationSlots}
                    onSelect={(slot) =>
                      setForm((current) => ({ ...current, time: slot }))
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {!form.date
                      ? "Choose a date to load the available consultation slots."
                      : availableConsultationSlots.length > 0
                        ? `${availableConsultationSlots.length} consultation slot${
                            availableConsultationSlots.length === 1 ? "" : "s"
                          } available.`
                        : hasManagedConsultationSlots
                          ? "All configured consultation times are already booked for the selected date."
                          : "No consultation slots are available for the selected date."}
                  </p>
                </>
              ) : (
                <input
                  type="time"
                  name="time"
                  value={form.time}
                  onChange={onChange}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Notes / Purpose
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={onChange}
              rows={3}
              placeholder="Add purpose or additional notes..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {isConsultationSelected ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Consultation requests use scheduled time slots and do not support file attachments.
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Attachments (optional)
              </label>
              <div className="flex flex-col gap-1">
                <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">
                  <input
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={onFormFileChange}
                  />
                  Choose files
                </label>
                <div className="text-xs text-slate-600">
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected: ${selectedFiles
                        .map((file) => file.name)
                        .join(", ")}`
                    : "No files selected"}
                </div>
                <div className="text-[11px] text-slate-500">
                  Allowed: PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, JPEG, PNG, GIF, WEBP (max 10MB each)
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeCreateModal}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingServices || availableServiceOptions.length === 0}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting
                ? "Submitting..."
                : loadingServices
                  ? "Loading services..."
                  : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={isRescheduleOpen}
        onClose={closeRescheduleModal}
        title="Reschedule Consultation"
        description="Choose a new date and consultation slot for this request."
        size="md"
      >
        <form onSubmit={onRescheduleSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Services
                </div>
                <div className="mt-1 text-slate-900">
                  {rescheduleTarget?.service || "Consultation"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current Date
                </div>
                <div className="mt-1 text-slate-900">
                  {rescheduleTarget?.date || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current Time
                </div>
                <div className="mt-1 text-slate-900">
                  {rescheduleTarget?.time
                    ? toTimeLabel(rescheduleTarget.time)
                    : "-"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                New Date
              </label>
              <input
                type="date"
                value={rescheduleForm.date}
                onChange={(e) =>
                  setRescheduleForm((current) => ({
                    ...current,
                    date: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                New Time
              </label>
              <ConsultationSlotPicker
                value={rescheduleForm.time}
                options={availableRescheduleSlots}
                disabled={!rescheduleForm.date}
                loading={loadingConsultationSlots}
                onSelect={(slot) =>
                  setRescheduleForm((current) => ({ ...current, time: slot }))
                }
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {!rescheduleForm.date
                  ? "Choose a date to load the available consultation slots."
                  : availableRescheduleSlots.length > 0
                    ? `${availableRescheduleSlots.length} consultation slot${
                        availableRescheduleSlots.length === 1 ? "" : "s"
                      } available.`
                    : hasManagedConsultationSlots
                      ? "All configured consultation times are already booked for the selected date."
                      : "No consultation slots are available for the selected date."}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Reason for Reschedule
            </label>
            <textarea
              value={rescheduleForm.reason}
              onChange={(event) =>
                setRescheduleForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              rows={3}
              placeholder="Add the reason for moving this consultation..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Rescheduling sends the consultation back for confirmation.
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeRescheduleModal}
              disabled={rescheduling}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={rescheduling}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {rescheduling ? "Saving..." : "Save Schedule"}
            </button>
          </div>
        </form>
      </Modal>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/50">
          <h3 className="text-sm font-semibold text-slate-800">My Appointments</h3>
          <p className="text-xs text-slate-500">
            See updates from the secretary in near real-time.
          </p>
        </div>

        {loadingAppointments ? (
          <div className="p-6 text-sm text-slate-600">Loading appointments…</div>
        ) : appointments.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No appointments or consultations found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-fixed">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Services
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Type
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Date
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Time
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Status
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Payment Status
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Notes
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Attachments
                    </th>
                    <th className="text-left font-semibold px-4 py-3 align-middle">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pagedAppointments.map((a, idx) => {
                  const recordKind = a.record_kind || "appointment";
                  const id =
                    recordKind === "consultation"
                      ? `consultation-${a.id || a.Scheduling_ID || idx}`
                      : a.id || a.appointment_id || a.Appointment_ID || idx;
                  const appointmentId =
                    recordKind === "consultation"
                      ? null
                      : a.appointment_id || a.Appointment_ID || a.id;
                  const schedulingId =
                    recordKind === "consultation"
                      ? a.Scheduling_ID || a.scheduling_id || a.id
                      : null;

                  const description = String(a.description || a.Description || "");

                  const readMeta = (key) => {
                    const escKey = String(key).replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    );
                    const re = new RegExp(
                      `^\\s*\\[${escKey}\\]\\s*([^\\r\\n]*)\\s*$`,
                      "im"
                    );
                    const m = description.match(re);
                    return m ? String(m[1] || "").trim() : "";
                  };

                  const readMetaLines = (key) => {
                    const escKey = String(key).replace(
                      /[.*+?^${}()|[\]\\]/g,
                      "\\$&"
                    );
                    const re = new RegExp(
                      `^\\s*\\[${escKey}\\]\\s*([^\\r\\n]*)\\s*$`,
                      "img"
                    );
                    const out = [];
                    let m;
                    // eslint-disable-next-line no-cond-assign
                    while ((m = re.exec(description)) !== null) {
                      out.push(String(m[1] || "").trim());
                    }
                    return out.filter(Boolean);
                  };

                  const service =
                    a.service ||
                    a.service_name ||
                    a.Services ||
                    a.Name ||
                    readMeta("Service") ||
                    readMeta("Type") ||
                    "-";
                  const date = a.date || a.appointment_date || a.Date || "";
                  const time =
                    a.time || a.appointment_time || a.Time || readMeta("Time") || "";
                  const status = normalizeAppointmentStatus(
                    a.status || a.Status || a.Status_name || a.status_name || "Pending"
                  );
                  const isConsultationRow =
                    recordKind === "consultation" ||
                    isConsultationService(readMeta("Type")) ||
                    isConsultationService(service);
                  const canRescheduleRow =
                    consultationsEnabled &&
                    !serviceAccess.businessPermitExpired &&
                    isConsultationRow &&
                    schedulingId &&
                    canRescheduleConsultation(status);
                  const actionAvailabilityLabel =
                    isConsultationRow && serviceAccess.businessPermitExpired
                      ? "Permit expired"
                      : isConsultationRow && !consultationsEnabled
                      ? "Consultations paused"
                      : getActionAvailabilityLabel(status);
                  const paymentStatus = isConsultationRow
                    ? "Not applicable"
                    : normalizePaymentStatus(
                        a.payment_status_name || a.payment_status || a.payment?.status_name
                      );
                  const hasPaymentRecord = Boolean(
                    a.payment_exists ?? a.payment?.exists ?? a.payment_status_name
                  );
                  const paymentMethodName =
                    a.payment_method_name || a.payment?.payment_method_name || "";
                  const paymentActionLabel = String(paymentStatus).toLowerCase() === "paid"
                    ? "View payment"
                    : hasPaymentRecord
                      ? "Update payment"
                      : "Pay now";
                  const meetingType =
                    a.meeting_type ||
                    a.meetingType ||
                    a.Appointment_Type ||
                    readMeta("Appointment_Type") ||
                    "";
                  const notes =
                    a.notes ||
                    a.purpose ||
                    a.Notes ||
                    a.secretary_notes ||
                    a.staff_notes ||
                    a.admin_notes ||
                    a.remark ||
                    a.remarks ||
                    a.comment ||
                    a.comments ||
                    readMeta("Notes") ||
                    "";

                  const attachments = readMetaLines("Attachment");
                  const attachmentPaths = Array.from(
                    new Set(
                      [...attachments, a.attachment_path, a.attachment]
                        .map((item) => String(item || "").trim())
                        .filter(Boolean)
                    )
                  );

                  const onUpload = async (files) => {
                    if (!appointmentId) {
                      setError("Cannot upload: missing appointment id.");
                      return;
                    }
                    const filesToUpload = Array.isArray(files) ? files : [];
                    if (filesToUpload.length === 0) {
                      return;
                    }

                    const validationError = validateAttachments(filesToUpload);
                    if (validationError) {
                      setError(validationError);
                      return;
                    }

                    setError("");
                    setSuccess("");

                    let uploadedCount = 0;
                    const failedUploads = [];

                    for (const file of filesToUpload) {
                      try {
                        const fd = new FormData();
                        fd.append("appointment_id", String(appointmentId));
                        fd.append("file", file);

                        const res = await api.post("/appointment_upload_file.php", fd, {
                          headers: { "Content-Type": "multipart/form-data" },
                        });

                        if (res?.data?.success) {
                          uploadedCount += 1;
                        } else {
                          failedUploads.push(
                            `${file.name}: ${res?.data?.message || "Upload failed."}`
                          );
                        }
                      } catch (err) {
                        failedUploads.push(
                          `${file.name}: ${err?.response?.data?.message || "Upload failed."}`
                        );
                      }
                    }

                    if (uploadedCount > 0) {
                      setSuccess(
                        uploadedCount === filesToUpload.length
                          ? `Uploaded ${uploadedCount} file${uploadedCount === 1 ? "" : "s"}.`
                          : `Uploaded ${uploadedCount} of ${filesToUpload.length} files.`
                      );
                      await refreshAppointments({ silent: true });
                    }

                    if (failedUploads.length > 0) {
                      const preview = failedUploads.slice(0, 2).join(" | ");
                      const suffix =
                        failedUploads.length > 2 ? ` (+${failedUploads.length - 2} more)` : "";
                      setError(`Some files failed: ${preview}${suffix}`);
                    }
                  };

                  return (
                    <tr key={id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-800 align-middle">
                        {service}
                      </td>
                      <td className="px-4 py-3 text-slate-800 align-middle">
                        {meetingType || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-800 align-middle">
                        {date}
                      </td>
                      <td className="px-4 py-3 text-slate-800 align-middle">
                        {time}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-slate-200 bg-white text-slate-700">
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {isConsultationRow ? (
                          <span className="text-xs text-slate-400">Not applicable</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentStatusBadgeClass(
                                paymentStatus,
                                hasPaymentRecord
                              )}`}
                            >
                              {paymentStatus}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {paymentMethodName
                                ? `${paymentMethodName} receipt uploaded`
                                : "No receipt uploaded yet"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[420px] align-middle">
                        <div className="line-clamp-2">{notes || "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 align-middle">
                        <div className="flex flex-col gap-1">
                          {attachmentPaths.length > 0 ? (
                            attachmentPaths.map((attachmentPath, attachmentIdx) => {
                              const fallbackName = String(attachmentPath).split("/").pop() || `file_${attachmentIdx + 1}`;
                              const linkName =
                                attachmentPath === a.attachment_path && a.document_filename
                                  ? a.document_filename
                                  : fallbackName;
                              const openUrl = toOpenFileUrl(attachmentPath, linkName);
                              return (
                                <a
                                  key={`${attachmentPath}-${attachmentIdx}`}
                                  href={openUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:text-indigo-700 underline text-xs"
                                >
                                  View {linkName}
                                </a>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-400">No file</span>
                          )}

                          {!isConsultationRow && appointmentId ? (
                            <>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="file"
                                  multiple
                                  accept={ATTACHMENT_ACCEPT}
                                  className="hidden"
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    if (files.length === 0) return;
                                    onUpload(files);
                                    // allow re-uploading the same file
                                    e.target.value = "";
                                  }}
                                />
                                <span className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                  Upload files
                                </span>
                              </label>
                              <span className="text-[11px] text-slate-400">
                                PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, JPEG, PNG, GIF, WEBP (max 10MB each)
                              </span>
                            </>
                          ) : isConsultationRow ? (
                            <span className="text-[11px] text-slate-400">
                              Consultation requests do not support file uploads.
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 align-middle">
                        {canRescheduleRow ? (
                          <button
                            type="button"
                            onClick={() =>
                              openRescheduleModal({
                                schedulingId,
                                service,
                                date,
                                time,
                                status,
                              })
                            }
                            className="inline-flex items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
                          >
                            Reschedule
                          </button>
                        ) : isConsultationRow ? (
                          <span className="text-xs text-slate-400">
                            {actionAvailabilityLabel}
                          </span>
                        ) : (
                          <div className="flex flex-col items-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/client/payment?appointment_id=${encodeURIComponent(String(appointmentId))}`
                                )
                              }
                              className="inline-flex items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                            >
                              {paymentActionLabel}
                            </button>
                            <span className="text-xs text-slate-400">
                              {actionAvailabilityLabel}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row">
              <div className="text-xs text-slate-600">
                Showing <span className="font-medium">{appointments.length === 0 ? 0 : appointmentStartIndex + 1}</span>-
                <span className="font-medium">
                  {Math.min(appointmentStartIndex + APPOINTMENTS_PAGE_SIZE, appointments.length)}
                </span> of <span className="font-medium">{appointments.length}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canGoToPreviousAppointmentPage) {
                      setAppointmentPage((page) => page - 1);
                    }
                  }}
                  disabled={!canGoToPreviousAppointmentPage}
                >
                  Previous
                </Button>

                <div className="text-xs text-slate-600">
                  Page <span className="font-medium">{appointmentPage}</span> of{" "}
                  <span className="font-medium">{appointmentTotalPages}</span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canGoToNextAppointmentPage) {
                      setAppointmentPage((page) => page + 1);
                    }
                  }}
                  disabled={!canGoToNextAppointmentPage}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

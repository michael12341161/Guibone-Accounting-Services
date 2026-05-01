import { resolveBackendAssetUrl } from "../services/api";

const DOCUMENT_VALIDITY_RULES = {
  business_permit: {
    key: "business_permit",
    label: "1 year",
    defaultDurationDays: 365,
    durationOptions: [{ days: 365, label: "1 year" }],
    durationSummary: "365 days",
  },
  dti: {
    key: "dti",
    label: "5 years",
    defaultDurationDays: 1825,
    durationOptions: [{ days: 1825, label: "5 years" }],
    durationSummary: "1825 days",
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DOCUMENT_DISPLAY_ORDER = [
  "valid_id",
  "birth_certificate",
  "psa_birth_certificate",
  "marriage_contract",
  "business_permit",
  "dti",
  "sec",
  "bir",
  "philhealth",
  "pag_ibig",
  "sss",
];
const DOCUMENT_DISPLAY_ORDER_INDEX = new Map(
  DOCUMENT_DISPLAY_ORDER.map((key, index) => [key, index])
);

function getDocumentSortKey(value) {
  const key = normalizeDocumentKey(value);
  if (key === "validid") return "valid_id";
  if (key === "psa_birth_certificate") return "birth_certificate";
  if (key === "pagibig") return "pag_ibig";
  return key;
}

export function normalizeDocumentKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (raw === "psa_birthcertificate") return "psa_birth_certificate";
  if (raw === "pagibig") return "pag_ibig";
  return raw;
}

export function formatDocumentTypeLabel(value) {
  const key = getDocumentSortKey(value);
  if (key === "valid_id" || key === "validid") return "Valid ID";
  if (key === "birth_certificate" || key === "psa_birth_certificate") return "PSA Birth Certificate";
  if (key === "marriage_contract") return "Marriage Contract (if applicable)";
  if (key === "business_permit") return "Business Permit";
  if (key === "dti") return "DTI";
  if (key === "sec") return "SEC";
  if (key === "bir") return "BIR";
  if (key === "philhealth") return "PhilHealth";
  if (key === "pag_ibig") return "Pag-IBIG";
  if (key === "sss") return "SSS";

  return String(value || "")
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isBusinessPermitDocument(value) {
  const source =
    value && typeof value === "object"
      ? value.document_type_name || value.name || value.document_type_key || value.label || ""
      : value;

  return normalizeDocumentKey(source) === "business_permit";
}

export function getDocumentStatusBadgeClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "expired") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "renewed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "registered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "uploaded") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (normalized === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function resolveDocumentUrl(path) {
  return resolveBackendAssetUrl(path);
}

export function getDocumentValidityRule(value) {
  const source =
    value && typeof value === "object"
      ? value.document_type_name || value.name || value.document_type_key || value.label || ""
      : value;
  const key = normalizeDocumentKey(source);
  const rule = DOCUMENT_VALIDITY_RULES[key];

  return rule ? { ...rule } : null;
}

export function getDocumentDurationOptions(value) {
  const rule = getDocumentValidityRule(value);
  return Array.isArray(rule?.durationOptions) ? [...rule.durationOptions] : [];
}

export function formatDocumentDurationDays(days) {
  const numericDays = Number(days || 0);
  if (!Number.isFinite(numericDays) || numericDays <= 0) return "Not set";

  const years = numericDays / 365;
  const yearLabel = Number.isInteger(years) && years > 0 ? ` (${years} year${years === 1 ? "" : "s"})` : "";
  return `${numericDays} day${numericDays === 1 ? "" : "s"}${yearLabel}`;
}

export function getDocumentValiditySummary(value) {
  const rule = getDocumentValidityRule(value);
  if (!rule) return "No expiration rule configured";
  return `${rule.label} (${rule.durationSummary})`;
}

function parsePositiveInteger(value) {
  const numericValue = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function normalizeDateOnly(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnlyTimestamp(value) {
  const normalizedDate = normalizeDateOnly(value);
  if (!normalizedDate) return null;

  const [year, month, day] = normalizedDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return null;

  return Date.UTC(year, month - 1, day);
}

function calculateExpirationDate(uploadedAt, durationDays) {
  const normalizedUploadedDate = normalizeDateOnly(uploadedAt);
  const numericDurationDays = parsePositiveInteger(durationDays);
  if (!normalizedUploadedDate || !numericDurationDays) return "";

  const baseDate = new Date(`${normalizedUploadedDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) return "";

  baseDate.setDate(baseDate.getDate() + numericDurationDays);
  return normalizeDateOnly(baseDate);
}

export function isDocumentExpired(expirationDate, referenceDate = new Date()) {
  const normalizedExpirationDate = normalizeDateOnly(expirationDate);
  if (!normalizedExpirationDate) return false;

  const today = normalizeDateOnly(referenceDate);
  return Boolean(today) && today > normalizedExpirationDate;
}

export function getDocumentRemainingDays(expirationDate, referenceDate = new Date()) {
  const expirationTimestamp = parseDateOnlyTimestamp(expirationDate);
  const referenceTimestamp = parseDateOnlyTimestamp(referenceDate);
  if (expirationTimestamp === null || referenceTimestamp === null) return null;

  return Math.round((expirationTimestamp - referenceTimestamp) / MS_PER_DAY);
}

export function formatDocumentRemainingDays(expirationDate, referenceDate = new Date()) {
  const remainingDays = getDocumentRemainingDays(expirationDate, referenceDate);
  if (remainingDays === null) return "Not set";
  if (remainingDays < 0) return "Expired";
  if (remainingDays === 0) return "Expires today";

  return `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining`;
}

function resolveDocumentDurationDays(name, document) {
  const storedDurationDays = parsePositiveInteger(document?.duration_days);
  const durationOptions = getDocumentDurationOptions(name);
  if (
    storedDurationDays &&
    (durationOptions.length === 0 || durationOptions.some((option) => option.days === storedDurationDays))
  ) {
    return storedDurationDays;
  }

  const rule = getDocumentValidityRule(name);
  const fallbackDurationDays = parsePositiveInteger(rule?.defaultDurationDays);
  return fallbackDurationDays || null;
}

function shouldRecalculateExpirationDate(document, resolvedDurationDays) {
  const storedDurationDays = parsePositiveInteger(document?.duration_days);
  return Boolean(storedDurationDays && resolvedDurationDays && storedDurationDays !== resolvedDurationDays);
}

function resolveDocumentStatus(name, document, isUploaded, isExpired) {
  if (!isUploaded) return "Pending";
  if (isExpired) return "Expired";

  const storedStatus =
    String(document?.status_name || document?.document_status_name || document?.status || "").trim();
  if (storedStatus) return storedStatus;

  return isBusinessPermitDocument(name) ? "Registered" : "Uploaded";
}

export function buildLatestDocumentMap(uploadedDocuments = []) {
  const map = new Map();

  (Array.isArray(uploadedDocuments) ? uploadedDocuments : []).forEach((document) => {
    const key = String(document?.document_type_id || document?.id || "").trim();
    if (!key || map.has(key)) return;
    map.set(key, document);
  });

  return map;
}

function compareDocumentTypes(left, right) {
  const leftBusinessPermit = isBusinessPermitDocument(left);
  const rightBusinessPermit = isBusinessPermitDocument(right);
  if (leftBusinessPermit !== rightBusinessPermit) {
    return leftBusinessPermit ? -1 : 1;
  }

  const leftRank = DOCUMENT_DISPLAY_ORDER_INDEX.get(
    getDocumentSortKey(left?.name || left?.document_type_name || "")
  );
  const rightRank = DOCUMENT_DISPLAY_ORDER_INDEX.get(
    getDocumentSortKey(right?.name || right?.document_type_name || "")
  );
  if (leftRank !== undefined || rightRank !== undefined) {
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }

  const leftId = Number(left?.id || left?.document_type_id || 0);
  const rightId = Number(right?.id || right?.document_type_id || 0);
  if (leftId && rightId && leftId !== rightId) {
    return leftId - rightId;
  }

  return formatDocumentTypeLabel(left?.name || left?.document_type_name || "").localeCompare(
    formatDocumentTypeLabel(right?.name || right?.document_type_name || "")
  );
}

export function buildDocumentSlots(documentTypes = [], uploadedDocuments = [], referenceDate = new Date()) {
  const latestDocumentMap = buildLatestDocumentMap(uploadedDocuments);
  const slots = [];
  const seenKeys = new Set();

  (Array.isArray(documentTypes) ? [...documentTypes].sort(compareDocumentTypes) : []).forEach((documentType) => {
    const id = Number(documentType?.id || documentType?.document_type_id || 0);
    const key = String(id || normalizeDocumentKey(documentType?.name || "")).trim();
    if (!key || seenKeys.has(key)) return;

    seenKeys.add(key);
    const document = id ? latestDocumentMap.get(String(id)) || null : null;
    const name = String(documentType?.name || document?.document_type_name || "document").trim();
    const isUploaded = Boolean(document?.filepath);
    const durationDays = resolveDocumentDurationDays(name, document);
    const storedExpirationDate = String(document?.expiration_date || "").trim();
    const expirationDate =
      storedExpirationDate && !shouldRecalculateExpirationDate(document, durationDays)
        ? storedExpirationDate
        : calculateExpirationDate(document?.uploaded_at, durationDays);
    const isExpired = isDocumentExpired(expirationDate, referenceDate);
    const remainingDays = getDocumentRemainingDays(expirationDate, referenceDate);
    const remainingDurationLabel = formatDocumentRemainingDays(expirationDate, referenceDate);
    const validityRule = getDocumentValidityRule(name);

    slots.push({
      id,
      key,
      name,
      label: formatDocumentTypeLabel(name),
      status: resolveDocumentStatus(name, document, isUploaded, isExpired),
      isUploaded,
      isExpired,
      isBusinessPermit: isBusinessPermitDocument(name),
      filename: document?.filename || "",
      filepath: document?.filepath || "",
      uploadedAt: document?.uploaded_at || "",
      durationDays,
      remainingDays,
      remainingDurationLabel,
      expirationDate: expirationDate || "",
      validityRule,
      document,
    });
  });

  latestDocumentMap.forEach((document, mapKey) => {
    if (seenKeys.has(mapKey)) return;

    const name = String(document?.document_type_name || `document_${mapKey}`).trim();
    const durationDays = resolveDocumentDurationDays(name, document);
    const storedExpirationDate = String(document?.expiration_date || "").trim();
    const expirationDate =
      storedExpirationDate && !shouldRecalculateExpirationDate(document, durationDays)
        ? storedExpirationDate
        : calculateExpirationDate(document?.uploaded_at, durationDays);
    const isExpired = isDocumentExpired(expirationDate, referenceDate);
    const remainingDays = getDocumentRemainingDays(expirationDate, referenceDate);
    const remainingDurationLabel = formatDocumentRemainingDays(expirationDate, referenceDate);
    const validityRule = getDocumentValidityRule(name);

    slots.push({
      id: Number(document?.document_type_id || 0),
      key: mapKey,
      name,
      label: formatDocumentTypeLabel(name),
      status: resolveDocumentStatus(name, document, Boolean(document?.filepath), isExpired),
      isUploaded: Boolean(document?.filepath),
      isExpired,
      isBusinessPermit: isBusinessPermitDocument(name),
      filename: document?.filename || "",
      filepath: document?.filepath || "",
      uploadedAt: document?.uploaded_at || "",
      durationDays,
      remainingDays,
      remainingDurationLabel,
      expirationDate: expirationDate || "",
      validityRule,
      document,
    });
  });

  return slots.sort(compareDocumentTypes);
}

export function getRegistrationStatusFromSlots(slots = []) {
  const businessPermitSlot = (Array.isArray(slots) ? slots : []).find((slot) => slot?.isBusinessPermit);
  if (!businessPermitSlot?.isUploaded) return "Pending";
  if (businessPermitSlot?.isExpired) return "Expired";
  return "Registered";
}

export function countRegisteredDocuments(slots = []) {
  return (Array.isArray(slots) ? slots : []).filter((slot) => slot?.isUploaded).length;
}

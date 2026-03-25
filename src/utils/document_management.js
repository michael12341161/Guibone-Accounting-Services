import { resolveBackendAssetUrl } from "../services/api";

export function normalizeDocumentKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (raw === "psa_birthcertificate") return "psa_birth_certificate";
  return raw;
}

export function formatDocumentTypeLabel(value) {
  const key = normalizeDocumentKey(value);
  if (key === "valid_id" || key === "validid") return "Valid ID";
  if (key === "birth_certificate" || key === "psa_birth_certificate") return "PSA Birth Certificate";
  if (key === "marriage_contract") return "Marriage Contract (if applicable)";
  if (key === "business_permit") return "Business Permit";

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
  if (normalized === "registered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function resolveDocumentUrl(path) {
  return resolveBackendAssetUrl(path);
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

  const leftId = Number(left?.id || left?.document_type_id || 0);
  const rightId = Number(right?.id || right?.document_type_id || 0);
  if (leftId && rightId && leftId !== rightId) {
    return leftId - rightId;
  }

  return formatDocumentTypeLabel(left?.name || left?.document_type_name || "").localeCompare(
    formatDocumentTypeLabel(right?.name || right?.document_type_name || "")
  );
}

export function buildDocumentSlots(documentTypes = [], uploadedDocuments = []) {
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

    slots.push({
      id,
      key,
      name,
      label: formatDocumentTypeLabel(name),
      status: isUploaded ? "Registered" : "Pending",
      isUploaded,
      isBusinessPermit: isBusinessPermitDocument(name),
      filename: document?.filename || "",
      filepath: document?.filepath || "",
      uploadedAt: document?.uploaded_at || "",
      document,
    });
  });

  latestDocumentMap.forEach((document, mapKey) => {
    if (seenKeys.has(mapKey)) return;

    const name = String(document?.document_type_name || `document_${mapKey}`).trim();
    slots.push({
      id: Number(document?.document_type_id || 0),
      key: mapKey,
      name,
      label: formatDocumentTypeLabel(name),
      status: document?.filepath ? "Registered" : "Pending",
      isUploaded: Boolean(document?.filepath),
      isBusinessPermit: isBusinessPermitDocument(name),
      filename: document?.filename || "",
      filepath: document?.filepath || "",
      uploadedAt: document?.uploaded_at || "",
      document,
    });
  });

  return slots.sort(compareDocumentTypes);
}

export function getRegistrationStatusFromSlots(slots = []) {
  return (Array.isArray(slots) ? slots : []).some((slot) => slot?.isBusinessPermit && slot?.isUploaded)
    ? "Registered"
    : "Pending";
}

export function countRegisteredDocuments(slots = []) {
  return (Array.isArray(slots) ? slots : []).filter((slot) => slot?.isUploaded).length;
}

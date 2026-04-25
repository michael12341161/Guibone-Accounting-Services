import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Eye, FileText, Search, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardHeader } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { DataTable } from "../../components/UI/table";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import { joinPersonName } from "../../utils/person_name";
import {
  buildDocumentSlots,
  getDocumentDurationOptions,
  getDocumentStatusBadgeClass,
  getRegistrationStatusFromSlots,
  getDocumentValiditySummary,
  normalizeDocumentKey,
  resolveDocumentUrl,
} from "../../utils/document_management";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { showConfirmDialog, useErrorToast } from "../../utils/feedback";

const MANAGED_DOCUMENT_KEYS = new Set(["business_permit", "dti", "sec", "lgu"]);
const SUPPORTING_DOCUMENT_KEYS = new Set(["dti", "sec", "lgu"]);
const EXPIRING_DOCUMENT_KEYS = new Set(["business_permit", "dti", "lgu"]);
const WATCHLIST_DOCUMENT_TYPES = [
  { id: 4, name: "business_permit" },
  { id: 5, name: "dti" },
  { id: 6, name: "sec" },
  { id: 7, name: "lgu" },
];

function normalizeClientId(value) {
  return String(value || "").trim();
}

function buildDocumentLocationState(currentState, selectedClientId) {
  const baseState = currentState && typeof currentState === "object" ? currentState : {};
  const nextClientId = normalizeClientId(selectedClientId);

  if (!nextClientId) {
    const nextState = { ...baseState };
    delete nextState.selectedClientId;
    return nextState;
  }

  return {
    ...baseState,
    selectedClientId: nextClientId,
  };
}

function fullName(client) {
  return joinPersonName([client?.first_name, client?.middle_name, client?.last_name]) || "-";
}

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Not uploaded yet";

  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Not set";

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getCurrentDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSlotKey(slot) {
  return normalizeDocumentKey(slot?.name || slot?.key || "");
}

function joinWatchlistLabels(slots = []) {
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => String(slot?.label || "").trim())
    .filter(Boolean)
    .join(", ");
}

function getEarliestExpirationSlot(slots = []) {
  return [...(Array.isArray(slots) ? slots : [])]
    .filter((slot) => String(slot?.expirationDate || "").trim())
    .sort((left, right) =>
      String(left?.expirationDate || "9999-12-31").localeCompare(String(right?.expirationDate || "9999-12-31"))
    )[0] || null;
}

function getNearestExpirySlot(slots = []) {
  return [...(Array.isArray(slots) ? slots : [])]
    .sort((left, right) => {
      const leftDays = Number.isFinite(left?.remainingDays) ? left.remainingDays : Number.MAX_SAFE_INTEGER;
      const rightDays = Number.isFinite(right?.remainingDays) ? right.remainingDays : Number.MAX_SAFE_INTEGER;
      if (leftDays !== rightDays) {
        return leftDays - rightDays;
      }
      return String(left?.label || "").localeCompare(String(right?.label || ""));
    })[0] || null;
}

function getWatchlistStatusBadgeClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "near expiry") return "border-sky-200 bg-sky-50 text-sky-700";
  if (normalized === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (normalized === "lacking") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

const NEAR_EXPIRY_DAYS = 30;

export default function DocumentAdminPage() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = useMemo(
    () => (location.state && typeof location.state === "object" ? location.state : {}),
    [location.state]
  );
  const searchClientId = useMemo(
    () => normalizeClientId(new URLSearchParams(location.search).get("client_id")),
    [location.search]
  );
  const cleanSearch = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("client_id");
    const nextSearch = params.toString();
    return nextSearch ? `?${nextSearch}` : "";
  }, [location.search]);
  const requestedClientId = normalizeClientId(locationState.selectedClientId || searchClientId);
  const [clients, setClients] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [watchlistDocumentsByClient, setWatchlistDocumentsByClient] = useState({});
  const [loadingWatchlistDocuments, setLoadingWatchlistDocuments] = useState(true);
  const [todayKey, setTodayKey] = useState(() => getCurrentDateKey());
  const [error, setError] = useState("");
  useErrorToast(error);
  const [success, setSuccess] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [pendingFiles, setPendingFiles] = useState({});
  const [pendingDurationDays, setPendingDurationDays] = useState({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState(null);
  const [viewerSlot, setViewerSlot] = useState(null);
  const [watchlistModalKey, setWatchlistModalKey] = useState("");
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const canUploadDocuments = hasFeatureActionAccess(user, "documents", "upload", permissions);
  const canViewDocuments =
    canUploadDocuments || hasFeatureActionAccess(user, "documents", "view-only", permissions);
  const isViewOnlyMode = canViewDocuments && !canUploadDocuments;

  const loadClients = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoadingClients(true);

      const response = await api.get("client_list.php");
      const rows = Array.isArray(response?.data?.clients) ? response.data.clients : [];
      setClients(rows);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load clients.");
      if (!silent) setClients([]);
    } finally {
      if (!silent) setLoadingClients(false);
    }
  };

  const loadDocumentTypes = async () => {
    try {
      const response = await api.get("client_form_options.php");
      setDocumentTypes(Array.isArray(response?.data?.document_types) ? response.data.document_types : []);
    } catch (_) {
      setDocumentTypes([]);
    }
  };

  const loadWatchlistDocuments = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoadingWatchlistDocuments(true);

      const response = await api.get("client_document_watchlist.php");
      const groupedRows =
        response?.data?.documents_by_client && typeof response.data.documents_by_client === "object"
          ? response.data.documents_by_client
          : {};
      setWatchlistDocumentsByClient(groupedRows);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load business document watchlist."
      );
      if (!silent) {
        setWatchlistDocumentsByClient({});
      }
    } finally {
      if (!silent) setLoadingWatchlistDocuments(false);
    }
  };

  const loadClientDocuments = async (clientId, { silent } = { silent: false }) => {
    if (!clientId) {
      setDocuments([]);
      return;
    }

    try {
      if (!silent) setLoadingDocuments(true);

      const response = await api.get("client_documents.php", { params: { client_id: clientId } });
      setDocuments(Array.isArray(response?.data?.documents) ? response.data.documents : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load client documents.");
      setDocuments([]);
    } finally {
      if (!silent) setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setError("");
      await Promise.all([
        loadClients({ silent: false }),
        loadDocumentTypes(),
        loadWatchlistDocuments({ silent: false }),
      ]);
    };

    void bootstrap();

    const interval = window.setInterval(() => {
      if (active) {
        void Promise.all([loadClients({ silent: true }), loadWatchlistDocuments({ silent: true })]);
      }
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // Keep countdown values fresh if the page stays open across midnight.
    const interval = window.setInterval(() => {
      setTodayKey((current) => {
        const next = getCurrentDateKey();
        return current === next ? current : next;
      });
    }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!searchClientId) {
      return;
    }

    navigate(
      {
        pathname: location.pathname,
        search: cleanSearch,
      },
      {
        replace: true,
        state: buildDocumentLocationState(locationState, locationState.selectedClientId || searchClientId),
      }
    );
  }, [cleanSearch, location.pathname, locationState, navigate, searchClientId]);

  useEffect(() => {
    if (!clients.length) {
      setSelectedClientId(null);
      return;
    }

    if (requestedClientId && clients.some((client) => String(client.id) === String(requestedClientId))) {
      setSelectedClientId((current) =>
        String(current) === String(requestedClientId) ? current : requestedClientId
      );
      return;
    }

    const currentExists = clients.some((client) => String(client.id) === String(selectedClientId));
    if (!currentExists) {
      setSelectedClientId(null);
    }
  }, [clients, requestedClientId, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) {
      setDocuments([]);
      setViewerSlot(null);
      return;
    }

    void loadClientDocuments(selectedClientId, { silent: false });
  }, [selectedClientId]);

  const selectedClient = useMemo(
    () => clients.find((client) => String(client.id) === String(selectedClientId)) || null,
    [clients, selectedClientId]
  );

  const documentSlots = useMemo(
    () => buildDocumentSlots(documentTypes, documents, todayKey),
    [documentTypes, documents, todayKey]
  );
  const businessPermitSlot = useMemo(() => {
    return documentSlots.find((slot) => slot.isBusinessPermit) || null;
  }, [documentSlots]);
  const managedDocumentSlots = useMemo(
    () =>
      documentSlots.filter((slot) =>
        MANAGED_DOCUMENT_KEYS.has(normalizeDocumentKey(slot?.name || slot?.key || ""))
      ),
    [documentSlots]
  );
  const watchlistDocumentTypes = useMemo(() => {
    const mergedTypes = new Map(
      WATCHLIST_DOCUMENT_TYPES.map((documentType) => [normalizeDocumentKey(documentType.name), documentType])
    );

    (Array.isArray(documentTypes) ? documentTypes : []).forEach((documentType) => {
      const key = normalizeDocumentKey(documentType?.name || documentType?.document_type_name || "");
      if (!MANAGED_DOCUMENT_KEYS.has(key)) return;
      mergedTypes.set(key, {
        id: Number(documentType?.id || documentType?.document_type_id || mergedTypes.get(key)?.id || 0),
        name: String(documentType?.name || documentType?.document_type_name || mergedTypes.get(key)?.name || key),
      });
    });

    return Array.from(mergedTypes.values());
  }, [documentTypes]);
  const watchlistSlotsByClient = useMemo(() => {
    const rows = {};

    clients.forEach((client) => {
      const clientId = String(client?.id || "").trim();
      if (!clientId) return;
      const uploadedDocuments = Array.isArray(watchlistDocumentsByClient[clientId])
        ? watchlistDocumentsByClient[clientId]
        : [];
      rows[clientId] = buildDocumentSlots(watchlistDocumentTypes, uploadedDocuments, todayKey);
    });

    return rows;
  }, [clients, todayKey, watchlistDocumentTypes, watchlistDocumentsByClient]);

  const viewerDocumentUrl = resolveDocumentUrl(viewerSlot?.filepath);
  const registrationStatus = businessPermitSlot
    ? getRegistrationStatusFromSlots([businessPermitSlot])
    : selectedClient?.document_status || "Pending";

  const businessWatchRows = useMemo(
    () =>
      clients.map((client) => {
        const clientId = String(client?.id || "").trim();
        const slots = watchlistSlotsByClient[clientId] || [];
        const businessPermit = slots.find((slot) => getSlotKey(slot) === "business_permit") || null;
        const missingSupportingDocuments = slots.filter(
          (slot) => SUPPORTING_DOCUMENT_KEYS.has(getSlotKey(slot)) && !slot.isUploaded
        );
        const expiredDocuments = slots.filter(
          (slot) => EXPIRING_DOCUMENT_KEYS.has(getSlotKey(slot)) && slot.isUploaded && slot.isExpired
        );
        const nearExpiryDocuments = slots.filter(
          (slot) =>
            EXPIRING_DOCUMENT_KEYS.has(getSlotKey(slot)) &&
            slot.isUploaded &&
            !slot.isExpired &&
            slot.remainingDays !== null &&
            slot.remainingDays >= 0 &&
            slot.remainingDays <= NEAR_EXPIRY_DAYS
        );
        const firstExpiredDocument = getEarliestExpirationSlot(expiredDocuments);
        const nextExpiringDocument = getNearestExpirySlot(nearExpiryDocuments);

        return {
          ...client,
          clientName: fullName(client),
          businessName: client?.business_trade_name || client?.business_brand || "No trade name",
          hasBusinessPermit: Boolean(businessPermit?.isUploaded),
          businessStatus: businessPermit ? getRegistrationStatusFromSlots([businessPermit]) : "Pending",
          expirationDate: businessPermit?.expirationDate || "",
          remainingDays: businessPermit?.remainingDays ?? null,
          remainingDurationLabel: businessPermit?.remainingDurationLabel || "Not set",
          missingSupportingDocuments,
          missingDocumentSummary: joinWatchlistLabels(missingSupportingDocuments),
          expiredDocuments,
          expiredDocumentSummary: expiredDocuments
            .map((slot) => `${slot.label}${slot.expirationDate ? ` (${formatDate(slot.expirationDate)})` : ""}`)
            .join(", "),
          firstExpiredDocument,
          nearExpiryDocuments,
          nearExpiryDocumentSummary: nearExpiryDocuments
            .map((slot) => `${slot.label}${slot.remainingDurationLabel ? ` (${slot.remainingDurationLabel})` : ""}`)
            .join(", "),
          nextExpiringDocument,
        };
      }),
    [clients, watchlistSlotsByClient]
  );

  const watchlistGroups = useMemo(() => {
    const pending = businessWatchRows
      .filter((row) => !row.hasBusinessPermit)
      .sort((left, right) =>
        `${left.businessName} ${left.clientName}`.localeCompare(`${right.businessName} ${right.clientName}`)
      );
    const lacking = businessWatchRows
      .filter((row) => row.missingSupportingDocuments.length > 0)
      .sort((left, right) => {
        if (left.missingSupportingDocuments.length !== right.missingSupportingDocuments.length) {
          return right.missingSupportingDocuments.length - left.missingSupportingDocuments.length;
        }
        return `${left.businessName} ${left.clientName}`.localeCompare(`${right.businessName} ${right.clientName}`);
      });
    const expired = businessWatchRows
      .filter((row) => row.expiredDocuments.length > 0)
      .sort((left, right) =>
        `${left.firstExpiredDocument?.expirationDate || "9999-12-31"} ${left.businessName}`.localeCompare(
          `${right.firstExpiredDocument?.expirationDate || "9999-12-31"} ${right.businessName}`
        )
      );
    const nearExpiry = businessWatchRows
      .filter((row) => row.nearExpiryDocuments.length > 0)
      .sort((left, right) => {
        const leftDays = Number.isFinite(left.nextExpiringDocument?.remainingDays)
          ? left.nextExpiringDocument.remainingDays
          : Number.MAX_SAFE_INTEGER;
        const rightDays = Number.isFinite(right.nextExpiringDocument?.remainingDays)
          ? right.nextExpiringDocument.remainingDays
          : Number.MAX_SAFE_INTEGER;
        if (leftDays !== rightDays) {
          return leftDays - rightDays;
        }
        return `${left.businessName} ${left.clientName}`.localeCompare(`${right.businessName} ${right.clientName}`);
      });

    return { pending, lacking, expired, nearExpiry };
  }, [businessWatchRows]);

  const activeWatchlist = useMemo(() => {
    if (watchlistModalKey === "pending") {
      return {
        key: "pending",
        title: "Pending Businesses",
        description: "These businesses are still waiting for a Business Permit upload.",
        rows: watchlistGroups.pending,
        emptyMessage: "No pending businesses right now.",
      };
    }

    if (watchlistModalKey === "lacking") {
      return {
        key: "lacking",
        title: "Lacking Documents",
        description: "These businesses are still missing one or more DTI, SEC, or LGU supporting documents.",
        rows: watchlistGroups.lacking,
        emptyMessage: "No businesses are missing DTI, SEC, or LGU documents right now.",
      };
    }

    if (watchlistModalKey === "expired") {
      return {
        key: "expired",
        title: "Expired Documents",
        description: "These businesses have expired Business Permit, DTI, or LGU documents on file.",
        rows: watchlistGroups.expired,
        emptyMessage: "No expired Business Permit, DTI, or LGU documents right now.",
      };
    }

    if (watchlistModalKey === "near-expiry") {
      return {
        key: "near-expiry",
        title: "Near Expiry Documents",
        description: "These businesses have Business Permit, DTI, or LGU documents that expire within the next 30 days.",
        rows: watchlistGroups.nearExpiry,
        emptyMessage: "No Business Permit, DTI, or LGU documents are expiring within the next 30 days.",
      };
    }

    return null;
  }, [watchlistGroups.expired, watchlistGroups.lacking, watchlistGroups.nearExpiry, watchlistGroups.pending, watchlistModalKey]);

  useEffect(() => {
    setWatchlistSearch("");
  }, [watchlistModalKey]);

  useEffect(() => {
    if (!viewerDocumentUrl) {
      setViewerSlot(null);
    }
  }, [viewerDocumentUrl]);

  const filteredWatchlistRows = useMemo(() => {
    if (!activeWatchlist?.rows?.length) {
      return [];
    }

    const query = String(watchlistSearch || "").trim().toLowerCase();
    if (!query) {
      return activeWatchlist.rows;
    }

    return activeWatchlist.rows.filter((row) =>
      [
        row.businessName,
        row.clientName,
        row.email,
        row.businessStatus,
        row.missingDocumentSummary,
        row.expiredDocumentSummary,
        row.nearExpiryDocumentSummary,
        row.expirationDate ? formatDate(row.expirationDate) : "",
        row.remainingDurationLabel,
      ].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [activeWatchlist?.rows, watchlistSearch]);

  const clientOptions = useMemo(
    () =>
      [...clients]
        .map((client) => ({
          id: client.id,
          label: `${client?.business_trade_name || client?.business_brand || "No trade name"} - ${fullName(client)}`,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [clients]
  );

  function handleClientSelect(clientId) {
    const nextClientId = normalizeClientId(clientId);
    setSelectedClientId(nextClientId || null);
    setPendingFiles({});
    setPendingDurationDays({});
    setSuccess("");
    setError("");
    navigate(
      {
        pathname: location.pathname,
        search: cleanSearch,
      },
      {
        replace: true,
        state: buildDocumentLocationState(locationState, nextClientId),
      }
    );
  }

  const watchlistStatusLabel =
    activeWatchlist?.key === "expired"
      ? "Expired"
      : activeWatchlist?.key === "near-expiry"
        ? "Near Expiry"
        : activeWatchlist?.key === "lacking"
          ? "Lacking"
          : "Pending";

  const watchlistColumns = [
    {
      key: "clientName",
      header: "Client Name",
      width: "28%",
      render: (_, row) => (
        <div className="min-w-[190px]">
          <div className="font-medium text-slate-900">{row.clientName}</div>
          <div className="break-all text-xs text-slate-500">{row.email || "No email"}</div>
        </div>
      ),
    },
    {
      key: "businessName",
      header: "Business Name",
      width: "24%",
      render: (value) => <span className="break-words">{value || "-"}</span>,
    },
    {
      key: "watchlistStatus",
      header: "Status",
      width: "14%",
      render: () => (
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getWatchlistStatusBadgeClass(
            watchlistStatusLabel
          )}`}
        >
          {watchlistStatusLabel}
        </span>
      ),
    },
    {
      key: "documentInfo",
      header:
        activeWatchlist?.key === "lacking"
          ? "Missing Documents"
          : activeWatchlist?.key === "expired"
            ? "Expired Documents"
            : activeWatchlist?.key === "near-expiry"
              ? "Near Expiry Documents"
              : "Business Permit",
      width: "22%",
      render: (_, row) => (
        <div className="min-w-[180px]">
          {activeWatchlist?.key === "lacking" ? (
            <>
              <div className="font-medium text-slate-900">{row.missingDocumentSummary || "No missing documents"}</div>
              <div className="text-xs text-slate-500">Missing DTI, SEC, and/or LGU supporting files.</div>
            </>
          ) : activeWatchlist?.key === "expired" ? (
            <>
              <div className="font-medium text-slate-900">{row.expiredDocumentSummary || "No expired documents"}</div>
              <div className="text-xs text-slate-500">
                {row.firstExpiredDocument?.expirationDate
                  ? `First expired on ${formatDate(row.firstExpiredDocument.expirationDate)}`
                  : "Business Permit, DTI, and LGU are tracked here."}
              </div>
            </>
          ) : activeWatchlist?.key === "near-expiry" ? (
            <>
              <div className="font-medium text-slate-900">{row.nearExpiryDocumentSummary || "No near expiry documents"}</div>
              <div className="text-xs text-slate-500">
                {row.nextExpiringDocument?.expirationDate
                  ? `Next expires on ${formatDate(row.nextExpiringDocument.expirationDate)}`
                  : `Expiring within ${NEAR_EXPIRY_DAYS} days.`}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium text-slate-900">Permit not uploaded yet</div>
              <div className="text-xs text-slate-500">Business Permit still needed.</div>
            </>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Action",
      width: "12%",
      align: "right",
      render: (_, row) => {
        const isSelected = String(selectedClientId || "") === String(row.id);
        return (
          <Button
            variant="secondary"
            size="sm"
            className={`watchlist-open-button ${isSelected ? "watchlist-open-button-selected" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              handleClientSelect(row.id);
              setWatchlistModalKey("");
            }}
          >
            <Eye className="h-4 w-4" />
            {isSelected ? "Opened" : "Open"}
          </Button>
        );
      },
    },
  ];

  const handleFileChange = (documentTypeId, file) => {
    setPendingFiles((current) => ({
      ...current,
      [documentTypeId]: file || null,
    }));
  };

  const handleDurationChange = (documentTypeId, durationDays) => {
    setPendingDurationDays((current) => ({
      ...current,
      [documentTypeId]: durationDays,
    }));
  };

  const uploadDocument = async (slot) => {
    const documentLabel = slot?.label || "Document";

    if (!selectedClient?.id || !slot?.id) {
      setError(`${documentLabel} is not configured yet.`);
      return;
    }

    const file = pendingFiles[slot.id];
    if (!file) {
      setError(`Choose a ${documentLabel} file first.`);
      return;
    }

    const confirmation = await showConfirmDialog({
      title: `${slot.isUploaded ? "Replace" : "Upload"} ${documentLabel}?`,
      text: `This will ${slot.isUploaded ? "replace" : "upload"} ${file.name} for ${fullName(selectedClient)}.`,
      confirmButtonText: slot.isUploaded ? "Replace" : "Upload",
    });

    if (!confirmation?.isConfirmed) {
      return;
    }

    try {
      setError("");
      setSuccess("");
      setUploadingDocumentId(String(slot.id));

      const formData = new FormData();
      formData.append("client_id", String(selectedClient.id));
      formData.append("document_type_id", String(slot.id));
      formData.append("file", file);

      const selectedDurationDays = String(
        pendingDurationDays[slot.id] || slot.durationDays || slot.validityRule?.defaultDurationDays || ""
      ).trim();
      if (selectedDurationDays) {
        formData.append("duration_days", selectedDurationDays);
      }

      const response = await api.post("client_upload_document.php", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Upload failed.");
      }

      setPendingFiles((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
      setPendingDurationDays((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
      setSuccess(
        response?.data?.message ||
          `${documentLabel} ${slot.isUploaded ? "replaced" : "uploaded"} successfully for ${fullName(selectedClient)}.`
      );

      await Promise.all([
        loadClientDocuments(selectedClient.id, { silent: true }),
        loadClients({ silent: true }),
        loadWatchlistDocuments({ silent: true }),
      ]);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || `Unable to upload ${documentLabel}.`);
    } finally {
      setUploadingDocumentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Business Document Management"
          description="Manage Business Permit, DTI, SEC, and LGU files here. Only the Business Permit marks the client business as registered."
        />
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
          ) : null}

          {isViewOnlyMode ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              View Only access is enabled for this role. Uploaded files can be reviewed here, but upload and replace actions are disabled.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader
          title="Business Document Watchlist"
          description="Use these card buttons to open a floating list of businesses that still need document action."
        />
        <CardContent className="space-y-4">
          {loadingClients || loadingWatchlistDocuments ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Loading client businesses...
            </div>
          ) : !clientOptions.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              No client businesses are available for document management.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
              <button
                type="button"
                onClick={() => setWatchlistModalKey("pending")}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-amber-700">
                  <FileText className="h-4 w-4" />
                  <div className="text-xs font-semibold uppercase tracking-wide">Pending Documents</div>
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{watchlistGroups.pending.length}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Businesses still waiting for a Business Permit upload.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWatchlistModalKey("lacking")}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-slate-700">
                  <FileText className="h-4 w-4" />
                  <div className="text-xs font-semibold uppercase tracking-wide">Lacking Documents</div>
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{watchlistGroups.lacking.length}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Businesses missing DTI, SEC, or LGU supporting documents.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWatchlistModalKey("expired")}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  <div className="text-xs font-semibold uppercase tracking-wide">Expired Documents</div>
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{watchlistGroups.expired.length}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Businesses with expired Business Permit, DTI, or LGU documents.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setWatchlistModalKey("near-expiry")}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2 text-sky-700">
                  <Clock3 className="h-4 w-4" />
                  <div className="text-xs font-semibold uppercase tracking-wide">Near Expiry</div>
                </div>
                <div className="mt-3 text-3xl font-semibold text-slate-900">{watchlistGroups.nearExpiry.length}</div>
                <div className="mt-2 text-xs leading-5 text-slate-600">
                  Businesses with Business Permit, DTI, or LGU documents expiring within the next {NEAR_EXPIRY_DAYS} days.
                </div>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader
          title={canUploadDocuments ? "Upload or Replace Business Documents" : "Business Documents"}
          description={
            selectedClient
              ? `${
                  selectedClient?.business_trade_name || selectedClient?.business_brand || "No trade name"
                } - ${fullName(selectedClient)}${
                  selectedClient?.email ? ` (${selectedClient.email})` : ""
                }`
              : "Choose a business from the watchlist cards above to review or upload documents."
          }
          action={
            selectedClient ? (
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentStatusBadgeClass(
                  registrationStatus
                )}`}
              >
                {registrationStatus}
              </span>
            ) : null
          }
        />
        <CardContent>
          {!selectedClient ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Choose a business from the Pending, Lacking, Expired, or Near Expiry cards first.
            </div>
          ) : loadingDocuments ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Loading business documents...
            </div>
          ) : !managedDocumentSlots.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Business document types are not configured yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {managedDocumentSlots.map((slot) => {
                const badgeClass = getDocumentStatusBadgeClass(slot.status);
                const badgeLabel = slot.status;
                const viewerLabel = slot.label || "Document";
                const actionLabel = slot.isUploaded ? `Replace ${viewerLabel}` : `Upload ${viewerLabel}`;
                const showExpirationDetails =
                  Boolean(slot.validityRule) || Boolean(slot.expirationDate) || slot.remainingDays !== null;
                const helperText = slot.isBusinessPermit
                  ? "Only this document changes the client's registration status."
                  : "This is stored as a supporting business document only.";
                const durationOptions = getDocumentDurationOptions(slot);
                const selectedDurationValue = String(
                  pendingDurationDays[slot.id] || slot.durationDays || slot.validityRule?.defaultDurationDays || ""
                );
                const hasCustomDurationPicker = durationOptions.length > 1;

                return (
                  <div key={slot.key} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-500" />
                          <div className="font-semibold text-slate-900">{viewerLabel}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                          <span className="text-xs text-slate-500">{formatDateTime(slot.uploadedAt)}</span>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          {slot.isUploaded ? slot.filename || `Uploaded ${viewerLabel}` : `No ${viewerLabel} uploaded yet.`}
                        </div>
                        {showExpirationDetails ? (
                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="font-semibold text-slate-700">Validity</div>
                              <div>{getDocumentValiditySummary(slot)}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="font-semibold text-slate-700">Days Remaining</div>
                              <div>{slot.remainingDurationLabel || "Not set"}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                              <div className="font-semibold text-slate-700">Expiration Date</div>
                              <div>{slot.expirationDate ? formatDate(slot.expirationDate) : "Not set"}</div>
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {helperText}
                        </div>
                        {canViewDocuments && slot.isUploaded && slot.filepath ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                            onClick={() => setViewerSlot(slot)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {`View ${viewerLabel}`}
                          </Button>
                        ) : null}
                      </div>

                      {canUploadDocuments ? (
                        <div className="w-full max-w-full space-y-3 2xl:max-w-md">
                          {hasCustomDurationPicker ? (
                            <div>
                              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                DTI Validity Period
                              </label>
                              <select
                                value={selectedDurationValue}
                                onChange={(event) => handleDurationChange(slot.id, event.target.value)}
                                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                              >
                                {durationOptions.map((option) => (
                                  <option key={option.days} value={String(option.days)}>
                                    {`${option.label} (${option.days} days)`}
                                  </option>
                                ))}
                              </select>
                              <div className="mt-2 text-xs text-slate-500">
                                Choose the DTI term so the system can calculate the correct expiration date.
                              </div>
                            </div>
                          ) : null}
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp"
                            onChange={(event) => handleFileChange(slot.id, event.target.files?.[0] || null)}
                            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-emerald-700"
                          />
                          <div className="text-xs text-slate-500">
                            {pendingFiles[slot.id]?.name || `Choose the ${viewerLabel} file to upload or replace.`}
                          </div>
                          <Button
                            variant="success"
                            size="sm"
                            disabled={!pendingFiles[slot.id] || Boolean(uploadingDocumentId)}
                            onClick={() => {
                              void uploadDocument(slot);
                            }}
                          >
                            <Upload className="h-4 w-4" />
                            {String(uploadingDocumentId || "") === String(slot.id) ? "Uploading..." : actionLabel}
                          </Button>
                        </div>
                      ) : (
                        <div className="w-full max-w-full 2xl:max-w-md">
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            Upload permission is disabled for this role.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={Boolean(activeWatchlist)}
        onClose={() => setWatchlistModalKey("")}
        title={activeWatchlist?.title || "Business Watchlist"}
        description={activeWatchlist?.description || "Choose a business to open its document details below."}
        size="xl"
      >
        {activeWatchlist?.rows?.length ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business Watchlist</div>
                <div className="mt-1 text-sm text-slate-600">Use search to find a client, then open its documents below.</div>
              </div>
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {filteredWatchlistRows.length} {filteredWatchlistRows.length === 1 ? "business" : "businesses"}
              </span>
            </div>

            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={watchlistSearch}
                onChange={(event) => setWatchlistSearch(event.target.value)}
                placeholder="Search client or business..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div>
              <DataTable
                columns={watchlistColumns}
                rows={filteredWatchlistRows}
                keyField="id"
                compact
                stickyHeader
                striped={false}
                className="shadow-none"
                emptyMessage={
                  watchlistSearch
                    ? "No businesses match your search."
                    : activeWatchlist?.emptyMessage || "No businesses match this watchlist right now."
                }
                onRowClick={(row) => {
                  handleClientSelect(row.id);
                  setWatchlistModalKey("");
                }}
                getRowClassName={(row) =>
                  String(selectedClientId || "") === String(row.id)
                    ? "watchlist-selected-row"
                    : ""
                }
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
            {activeWatchlist?.emptyMessage || "No businesses match this watchlist right now."}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(viewerSlot)}
        onClose={() => setViewerSlot(null)}
        title={`${viewerSlot?.label || "Document"} Viewer`}
        description={
          selectedClient
            ? `Previewing ${viewerSlot?.label || "the document"} for ${fullName(selectedClient)}.`
            : "Preview the uploaded document here."
        }
        size="lg"
        footer={
          <>
            {viewerDocumentUrl ? (
              <a
                href={viewerDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
                Open in New Tab
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => setViewerSlot(null)}>
              Close
            </Button>
          </>
        }
      >
        {viewerSlot?.isUploaded && viewerDocumentUrl ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${getDocumentStatusBadgeClass(viewerSlot.status)}`}
              >
                {viewerSlot.status}
              </span>
              <span>{viewerSlot.filename || viewerSlot.label || "Document"}</span>
              {viewerSlot?.validityRule || viewerSlot?.expirationDate || viewerSlot?.remainingDays !== null ? (
                <>
                  <span>{viewerSlot.expirationDate ? `Expires ${formatDate(viewerSlot.expirationDate)}` : "No expiration date set"}</span>
                  <span>{viewerSlot.remainingDurationLabel || "Not set"}</span>
                </>
              ) : null}
            </div>
            <iframe
              key={viewerDocumentUrl}
              src={viewerDocumentUrl}
              title={viewerSlot?.label || "Document"}
              className="h-[70vh] w-full rounded-xl border border-slate-200 bg-slate-50"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No document is available to preview right now.
          </div>
        )}
      </Modal>
    </div>
  );
}

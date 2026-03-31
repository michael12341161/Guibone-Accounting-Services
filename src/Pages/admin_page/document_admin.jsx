import React, { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Upload } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import { joinPersonName } from "../../utils/person_name";
import {
  buildDocumentSlots,
  getDocumentStatusBadgeClass,
  getRegistrationStatusFromSlots,
  normalizeDocumentKey,
  resolveDocumentUrl,
} from "../../utils/document_management";
import { hasFeatureActionAccess } from "../../utils/module_permissions";

const MANAGED_DOCUMENT_KEYS = new Set(["business_permit", "dti", "sec", "lgu"]);

function fullName(client) {
  return joinPersonName([client?.first_name, client?.middle_name, client?.last_name]) || "-";
}

function formatRegisteredDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
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

export default function DocumentAdminPage() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedClientId = searchParams.get("client_id");
  const [clients, setClients] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [pendingFiles, setPendingFiles] = useState({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState(null);
  const [viewerSlot, setViewerSlot] = useState(null);
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
      await Promise.all([loadClients({ silent: false }), loadDocumentTypes()]);
    };

    void bootstrap();

    const interval = window.setInterval(() => {
      if (active) {
        void loadClients({ silent: true });
      }
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

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
      setSelectedClientId(clients[0]?.id || null);
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

  const documentSlots = useMemo(() => buildDocumentSlots(documentTypes, documents), [documentTypes, documents]);
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
  const supportDocumentSlots = useMemo(
    () => managedDocumentSlots.filter((slot) => !slot.isBusinessPermit),
    [managedDocumentSlots]
  );
  const uploadedSupportDocumentCount = useMemo(
    () => supportDocumentSlots.filter((slot) => slot.isUploaded).length,
    [supportDocumentSlots]
  );

  const viewerDocumentUrl = resolveDocumentUrl(viewerSlot?.filepath);
  const registrationStatus =
    selectedClient?.document_status ||
    getRegistrationStatusFromSlots(businessPermitSlot ? [businessPermitSlot] : []);

  useEffect(() => {
    if (!viewerDocumentUrl) {
      setViewerSlot(null);
    }
  }, [viewerDocumentUrl]);

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

  const handleClientSelect = (clientId) => {
    const nextClientId = String(clientId || "").trim();
    setSelectedClientId(nextClientId || null);
    setSuccess("");
    setError("");
    setSearchParams(nextClientId ? { client_id: nextClientId } : {}, { replace: true });
  };

  const handleFileChange = (documentTypeId, file) => {
    setPendingFiles((current) => ({
      ...current,
      [documentTypeId]: file || null,
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

    try {
      setError("");
      setSuccess("");
      setUploadingDocumentId(String(slot.id));

      const formData = new FormData();
      formData.append("client_id", String(selectedClient.id));
      formData.append("document_type_id", String(slot.id));
      formData.append("file", file);

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
      setSuccess(
        response?.data?.message ||
          `${documentLabel} ${slot.isUploaded ? "replaced" : "uploaded"} successfully for ${fullName(selectedClient)}.`
      );

      await Promise.all([
        loadClientDocuments(selectedClient.id, { silent: true }),
        loadClients({ silent: true }),
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
          title="Select Client Business"
          description="Choose a client business here. The full registered and unregistered list is now in the Business Status page."
        />
        <CardContent className="space-y-4">
          {loadingClients ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Loading client businesses...
            </div>
          ) : !clientOptions.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              No client businesses are available for document management.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="space-y-2">
                  <label htmlFor="business-permit-client" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Client Business
                  </label>
                  <select
                    id="business-permit-client"
                    value={selectedClientId || ""}
                    onChange={(event) => handleClientSelect(event.target.value)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    {clientOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-slate-500">
                    Need the full list of registered and unregistered businesses? Open the Business Status page from the sidebar.
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Selection</div>
                    <div className="font-semibold text-slate-900">
                      {selectedClient ? fullName(selectedClient) : "No client selected"}
                    </div>
                    <div className="text-sm text-slate-600">
                      {selectedClient?.business_trade_name || selectedClient?.business_brand || "No trade name"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentStatusBadgeClass(registrationStatus)}`}>
                        {registrationStatus}
                      </span>
                      <span className="text-xs text-slate-500">{selectedClient?.email || "No email"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedClient ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card compact variant={registrationStatus === "Registered" ? "success" : "warning"}>
                    <CardContent className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration Status</div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentStatusBadgeClass(registrationStatus)}`}>
                        {registrationStatus}
                      </span>
                      <CardDescription>Business Permit upload is the trigger for registration.</CardDescription>
                    </CardContent>
                  </Card>

                  <Card compact>
                    <CardContent className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business Permit File</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {businessPermitSlot?.isUploaded ? businessPermitSlot.filename || "Uploaded" : "Awaiting upload"}
                      </div>
                      <CardDescription>{formatDateTime(businessPermitSlot?.uploadedAt)}</CardDescription>
                    </CardContent>
                  </Card>

                  <Card compact variant={uploadedSupportDocumentCount > 0 ? "success" : undefined}>
                    <CardContent className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting Business Docs</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {uploadedSupportDocumentCount} / {supportDocumentSlots.length || 3} uploaded
                      </div>
                      <CardDescription>DTI, SEC, and LGU are stored for reference only and do not register the business.</CardDescription>
                    </CardContent>
                  </Card>

                  <Card compact>
                    <CardContent className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client Since</div>
                      <div className="text-sm font-semibold text-slate-900">{formatRegisteredDate(selectedClient?.registered_at)}</div>
                      <CardDescription>{selectedClient?.email || "No email"}</CardDescription>
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader
          title={canUploadDocuments ? "Upload or Replace Business Documents" : "Business Documents"}
          description={
            canUploadDocuments
              ? "Manage Business Permit, DTI, SEC, and LGU here. Only the Business Permit affects registration status."
              : "View Business Permit, DTI, SEC, and LGU files here. Upload and replace actions are disabled for this role."
          }
        />
        <CardContent>
          {!selectedClient ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Choose a client business first.
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
                const badgeClass = slot.isBusinessPermit
                  ? getDocumentStatusBadgeClass(slot.status)
                  : slot.isUploaded
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-slate-50 text-slate-700";
                const badgeLabel = slot.isBusinessPermit ? slot.status : slot.isUploaded ? "Uploaded" : "Pending";
                const viewerLabel = slot.label || "Document";
                const actionLabel = slot.isUploaded ? `Replace ${viewerLabel}` : `Upload ${viewerLabel}`;
                const helperText = slot.isBusinessPermit
                  ? "Only this document changes the client's registration status."
                  : "This is stored as a supporting business document only.";

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
                className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                  viewerSlot.isBusinessPermit
                    ? getDocumentStatusBadgeClass(viewerSlot.status)
                    : viewerSlot.isUploaded
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                {viewerSlot.isBusinessPermit ? viewerSlot.status : "Uploaded"}
              </span>
              <span>{viewerSlot.filename || viewerSlot.label || "Document"}</span>
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

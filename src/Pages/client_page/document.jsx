import React, { useEffect, useMemo, useState } from "react";
import { Eye, FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "../../components/UI/card";
import { Button } from "../../components/UI/buttons";
import { Modal } from "../../components/UI/modal";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import {
  buildDocumentSlots,
  getDocumentStatusBadgeClass,
  getRegistrationStatusFromSlots,
  normalizeDocumentKey,
  resolveDocumentUrl,
} from "../../utils/document_management";

const MANAGED_DOCUMENT_KEYS = new Set(["business_permit", "dti", "sec", "lgu"]);

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

export default function ClientDocumentsPage() {
  const { user } = useAuth();
  const clientId = Number(user?.client_id || user?.Client_ID || 0);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [clientRecord, setClientRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerSlot, setViewerSlot] = useState(null);

  const loadDocuments = async ({ silent } = { silent: false }) => {
    if (!clientId) {
      setError("Your client record could not be found.");
      setLoading(false);
      return;
    }

    try {
      if (!silent) setLoading(true);
      setError("");

      const [optionsRes, documentsRes, clientRes] = await Promise.all([
        api.get("client_form_options.php").catch(() => null),
        api.get("client_documents.php", { params: { client_id: clientId } }).catch(() => null),
        api.get("client_list.php", { params: { client_id: clientId } }).catch(() => null),
      ]);

      setDocumentTypes(Array.isArray(optionsRes?.data?.document_types) ? optionsRes.data.document_types : []);
      setDocuments(Array.isArray(documentsRes?.data?.documents) ? documentsRes.data.documents : []);
      setClientRecord(Array.isArray(clientRes?.data?.clients) ? clientRes.data.clients[0] || null : null);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load documents.");
      setDocumentTypes([]);
      setDocuments([]);
      setClientRecord(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    if (active) {
      void loadDocuments({ silent: false });
    }

    const interval = window.setInterval(() => {
      if (active) {
        void loadDocuments({ silent: true });
      }
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
  const registrationStatus =
    clientRecord?.document_status ||
    getRegistrationStatusFromSlots(businessPermitSlot ? [businessPermitSlot] : []);
  const viewerDocumentUrl = resolveDocumentUrl(viewerSlot?.filepath);

  useEffect(() => {
    if (!viewerDocumentUrl) {
      setViewerSlot(null);
    }
  }, [viewerDocumentUrl]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Business Documents"
          description="View Business Permit, DTI, SEC, and LGU uploaded by the admin. Only the Business Permit changes registration status."
        />
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card compact variant={registrationStatus === "Registered" ? "success" : "warning"}>
              <CardContent className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration Status</div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentStatusBadgeClass(registrationStatus)}`}>
                  {registrationStatus}
                </span>
                <CardDescription>Business Permit controls whether the account is marked as registered.</CardDescription>
              </CardContent>
            </Card>

            <Card compact>
              <CardContent className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business Name</div>
                <div className="text-sm font-semibold text-slate-900">
                  {clientRecord?.business_trade_name || clientRecord?.business_brand || "No business name yet"}
                </div>
                <CardDescription>This permit is attached to your client business record.</CardDescription>
              </CardContent>
            </Card>

            <Card compact variant={businessPermitSlot?.isUploaded ? "success" : "warning"}>
              <CardContent className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business Permit</div>
                <div className="text-sm font-semibold text-slate-900">
                  {businessPermitSlot?.isUploaded ? businessPermitSlot.filename || "Uploaded" : "Awaiting upload"}
                </div>
                <CardDescription>
                  {businessPermitSlot?.isUploaded ? "Your Business Permit is available to view." : "The admin has not uploaded your Business Permit yet."}
                </CardDescription>
              </CardContent>
            </Card>

            <Card compact variant={uploadedSupportDocumentCount > 0 ? "success" : undefined}>
              <CardContent className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting Business Docs</div>
                <div className="text-sm font-semibold text-slate-900">
                  {uploadedSupportDocumentCount} / {supportDocumentSlots.length || 3} uploaded
                </div>
                <CardDescription>DTI, SEC, and LGU are supporting documents only and do not register the business.</CardDescription>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6">
        <Card className="min-w-0">
          <CardHeader
            title="Business Document Details"
            description="These files are uploaded by the admin. Business Permit registers your business; DTI, SEC, and LGU are for supporting records only."
          />
          <CardContent>
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                Loading business documents...
              </div>
            ) : !managedDocumentSlots.length ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                Business document types are not configured yet for your account.
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
                  const helperText = slot.isBusinessPermit
                    ? "This file is managed only by the admin. Once the Business Permit is uploaded, your business status changes to registered."
                    : "This file is managed only by the admin and is kept as a supporting business record.";
                  const viewerLabel = slot.label || "Document";
                  const openLabel = slot.isBusinessPermit ? "Open Business Permit" : `Open ${viewerLabel}`;
                  const previewLabel = slot.isBusinessPermit ? "Preview Business Permit" : `Preview ${viewerLabel}`;

                  return (
                    <div key={slot.key} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-500" />
                              <div className="font-semibold text-slate-900">{viewerLabel}</div>
                            </div>
                            <div className="mt-2 text-sm text-slate-600">
                              {slot.isUploaded ? slot.filename || `Uploaded ${viewerLabel}` : `Waiting for admin upload`}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">{formatDateTime(slot.uploadedAt)}</div>
                          </div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        </div>

                        <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                          {helperText}
                        </div>

                        {slot.isUploaded && slot.filepath ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <Button variant="secondary" size="sm" onClick={() => setViewerSlot(slot)}>
                              <Eye className="h-4 w-4" />
                              {previewLabel}
                            </Button>
                            <a
                              href={resolveDocumentUrl(slot.filepath)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              <Eye className="h-4 w-4" />
                              {openLabel}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={Boolean(viewerSlot)}
        onClose={() => setViewerSlot(null)}
        title={`${viewerSlot?.label || "Document"} Viewer`}
        description={`Preview the uploaded ${viewerSlot?.label || "document"} in this floating card.`}
        size="lg"
        footer={
          viewerDocumentUrl ? (
            <a
              href={viewerDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Eye className="h-4 w-4" />
              Open
            </a>
          ) : null
        }
      >
        {viewerSlot?.isUploaded && viewerDocumentUrl ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                  viewerSlot.isBusinessPermit
                    ? getDocumentStatusBadgeClass(viewerSlot.status)
                    : "border-sky-200 bg-sky-50 text-sky-700"
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
          <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <div className="max-w-sm space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="text-lg font-semibold text-slate-900">Document is still pending</div>
              <div className="text-sm text-slate-500">
                The admin has not uploaded this document yet, so there is nothing to preview right now.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

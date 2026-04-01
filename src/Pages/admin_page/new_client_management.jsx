import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { joinPersonName } from "../../utils/person_name";
import { useErrorToast } from "../../utils/feedback";

const PAGE_SIZE = 10;

function fullName(client) {
  return joinPersonName([client?.first_name, client?.middle_name, client?.last_name]);
}

function normalizeApprovalStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "approved") return "Approved";
  if (raw === "rejected") return "Rejected";
  return "Pending";
}

function resolveApprovalStatus(client) {
  if (!client) return "Pending";

  const direct = String(client?.approval_status || "").trim();
  if (direct) return normalizeApprovalStatus(direct);

  const statusText = String(client?.status || "").trim().toLowerCase();
  if (statusText === "active") return "Approved";
  if (statusText === "inactive") return "Rejected";

  const statusId = Number(client?.status_id ?? client?.statusId ?? 0);
  if (statusId === 1) return "Approved";
  if (statusId === 2) return "Rejected";

  return "Pending";
}

function getStatusPillClass(status) {
  const normalized = normalizeApprovalStatus(status).toLowerCase();
  if (normalized === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function canRejectClient(status) {
  return normalizeApprovalStatus(status) === "Pending";
}

function canApproveClient(status) {
  return normalizeApprovalStatus(status) === "Pending";
}

function toDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRegisteredDate(value) {
  const date = toDateValue(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRegisteredDateTime(value) {
  const date = toDateValue(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatActionBy(entry) {
  const status = resolveApprovalStatus(entry);
  if (status === "Pending") return "-";

  const display = String(entry?.action_by_name || entry?.action_by_username || "").trim();
  if (display) return display;

  const actionId = Number(entry?.action_by ?? entry?.Action_by ?? 0);
  return actionId > 0 ? `User #${actionId}` : "-";
}

function documentUrl(path) {
  const normalized = String(path || "").trim().replace(/^\/+/, "");
  if (!normalized) return "";
  const base = String(api.defaults.baseURL || "").replace(/api\/?$/, "");
  return `${base}${normalized}`;
}

function matchesSearch(client, search) {
  const needle = String(search || "").trim().toLowerCase();
  if (!needle) return true;

  return [
    fullName(client),
    client?.email,
    client?.phone,
    resolveApprovalStatus(client),
    client?.address,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export default function NewClientManagement() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionState, setActionState] = useState({ clientId: null, status: "" });
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewClient, setViewClient] = useState(null);
  const [viewBusiness, setViewBusiness] = useState(null);
  const [viewDocuments, setViewDocuments] = useState([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetClient, setRejectTargetClient] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");
  useErrorToast(error);
  useErrorToast(rejectionError);

  const loadClients = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const res = await api.get("client_list.php", {
        params: { registration_source: "self_signup" },
      });

      if (res?.data?.success && Array.isArray(res.data.clients)) {
        setClients(res.data.clients);
      } else if (!silent) {
        setClients([]);
      }
    } catch (requestError) {
      if (!silent) {
        setError(requestError?.response?.data?.message || requestError?.message || "Unable to load registered clients.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!active) return;
      await loadClients({ silent: false });
    };

    run();

    const interval = window.setInterval(() => {
      if (!active) return;
      loadClients({ silent: true });
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const summary = useMemo(() => {
    return clients.reduce(
      (acc, client) => {
        const status = resolveApprovalStatus(client);
        acc.total += 1;
        if (status === "Approved") acc.approved += 1;
        else if (status === "Rejected") acc.rejected += 1;
        else acc.pending += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0 }
    );
  }, [clients]);

  const filteredClients = useMemo(() => {
    return [...clients]
      .filter((client) => matchesSearch(client, search))
      .sort((a, b) => {
        const aTime = toDateValue(a?.registered_at)?.getTime() || 0;
        const bTime = toDateValue(b?.registered_at)?.getTime() || 0;
        return bTime - aTime || Number(b?.id || 0) - Number(a?.id || 0);
      });
  }, [clients, search]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedClients = filteredClients.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const updateClientApproval = async (client, approvalStatus, rejectionReasonValue = "") => {
    if (!client?.id) return false;

    const nextActionStatus = normalizeApprovalStatus(approvalStatus);
    const normalizedRejectionReason = String(rejectionReasonValue || "").trim();

    setActionState({ clientId: client.id, status: nextActionStatus });
    setError("");
    setSuccess("");
    if (nextActionStatus === "Rejected") {
      setRejectionError("");
    }

    try {
      const res = await api.post("client_create.php", {
        action: "update_approval",
        client_id: client.id,
        approval_status: approvalStatus,
        ...(nextActionStatus === "Rejected" ? { rejection_reason: normalizedRejectionReason } : {}),
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Unable to update client status.");
      }

      const updatedClient = res?.data?.client;
      const nextStatus = updatedClient ? resolveApprovalStatus(updatedClient) : normalizeApprovalStatus(approvalStatus);

      setClients((prev) =>
        prev.map((entry) =>
          entry.id === client.id
            ? {
                ...entry,
                ...(updatedClient || {}),
                approval_status: nextStatus,
              }
            : entry
        )
      );

      setViewClient((prev) =>
        prev?.id === client.id
          ? {
              ...prev,
              ...(updatedClient || {}),
              approval_status: nextStatus,
            }
          : prev
      );

      setSuccess(
        res?.data?.message || `Client ${fullName(client) || client.email || `#${client.id}`} marked as ${nextStatus}.`
      );
      return true;
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || "Unable to update client status.";
      setError(message);
      if (nextActionStatus === "Rejected") {
        setRejectionError(message);
      }
      return false;
    } finally {
      setActionState({ clientId: null, status: "" });
    }
  };

  const openViewModal = async (client) => {
    setViewClient(client);
    setViewBusiness(null);
    setViewDocuments([]);
    setViewLoading(true);
    setViewOpen(true);

    try {
      const [businessRes, documentsRes] = await Promise.all([
        api.get("client_business.php", { params: { client_id: client.id } }).catch(() => null),
        api.get("client_documents.php", { params: { client_id: client.id } }).catch(() => null),
      ]);

      if (businessRes?.data?.success) {
        setViewBusiness(businessRes.data.business || null);
      }

      if (documentsRes?.data?.success && Array.isArray(documentsRes.data.documents)) {
        setViewDocuments(documentsRes.data.documents);
      }
    } finally {
      setViewLoading(false);
    }
  };

  const closeViewModal = () => {
    setViewOpen(false);
    setViewLoading(false);
    setViewClient(null);
    setViewBusiness(null);
    setViewDocuments([]);
  };

  const openRejectModal = (client) => {
    if (!client?.id) return;
    setRejectTargetClient(client);
    setRejectionReason(String(client?.rejection_reason || "").trim());
    setRejectionError("");
    setRejectModalOpen(true);
  };

  const closeRejectModal = () => {
    const rejectBusy = actionState.clientId === rejectTargetClient?.id && actionState.status === "Rejected";
    if (rejectBusy) return;
    setRejectModalOpen(false);
    setRejectTargetClient(null);
    setRejectionReason("");
    setRejectionError("");
  };

  const submitRejectClient = async () => {
    if (!rejectTargetClient?.id) return;

    const reason = String(rejectionReason || "").trim();
    if (!reason) {
      setRejectionError("Please enter the reason or missing requirements for this rejection.");
      return;
    }

    const didUpdate = await updateClientApproval(rejectTargetClient, "Rejected", reason);
    if (didUpdate) {
      closeRejectModal();
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "client_name",
        header: "Client Name",
        width: "22%",
        render: (_, row) => (
          <div className="min-w-[180px]">
            <div className="font-medium text-slate-900">{fullName(row) || "-"}</div>
          </div>
        ),
      },
      {
        key: "email",
        header: "Email",
        width: "20%",
        render: (value) => <span className="break-all">{value || "-"}</span>,
      },
      {
        key: "phone",
        header: "Contact Number",
        width: "14%",
      },
      {
        key: "registered_at",
        header: "Date Registered",
        width: "14%",
        render: (value) => formatRegisteredDate(value),
      },
      {
        key: "approval_status",
        header: "Status",
        width: "12%",
        render: (_, row) => {
          const status = resolveApprovalStatus(row);
          return (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(status)}`}>
              {status}
            </span>
          );
        },
      },
      {
        key: "action_by",
        header: "Action By",
        width: "14%",
        render: (_, row) => <span className="break-words">{formatActionBy(row)}</span>,
      },
      {
        key: "actions",
        header: "Action",
        width: "16%",
        align: "center",
        render: (_, row) => {
          const currentStatus = resolveApprovalStatus(row);
          const isBusy = actionState.clientId === row.id;

          return (
            <div className="flex items-center justify-center gap-2">
              <IconButton
                size="sm"
                variant="success"
                title="Approve client"
                aria-label={`Approve ${fullName(row) || row.email || "client"}`}
                disabled={isBusy || !canApproveClient(currentStatus)}
                onClick={(event) => {
                  event.stopPropagation();
                  updateClientApproval(row, "Approved");
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              </IconButton>

              <IconButton
                size="sm"
                variant="danger"
                title="Reject client"
                aria-label={`Reject ${fullName(row) || row.email || "client"}`}
                disabled={isBusy || !canRejectClient(currentStatus)}
                onClick={(event) => {
                  event.stopPropagation();
                  openRejectModal(row);
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </IconButton>

              <IconButton
                size="sm"
                variant="secondary"
                title="View client details"
                aria-label={`View ${fullName(row) || row.email || "client"} details`}
                disabled={isBusy}
                onClick={(event) => {
                  event.stopPropagation();
                  openViewModal(row);
                }}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12Z"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </IconButton>
            </div>
          );
        },
      },
    ],
    [actionState]
  );

  const rejectBusy = actionState.clientId === rejectTargetClient?.id && actionState.status === "Rejected";
  const rejectReasonTrimmed = String(rejectionReason || "").trim();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card compact>
          <CardContent className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Registrations</div>
            <div className="text-2xl font-semibold text-slate-900">{summary.total}</div>
            <CardDescription>Clients submitted from the sign-up page.</CardDescription>
          </CardContent>
        </Card>

        <Card compact variant="warning">
          <CardContent className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pending</div>
            <div className="text-2xl font-semibold text-slate-900">{summary.pending}</div>
            <CardDescription>Waiting for admin review.</CardDescription>
          </CardContent>
        </Card>

        <Card compact variant="success">
          <CardContent className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Approved</div>
            <div className="text-2xl font-semibold text-slate-900">{summary.approved}</div>
            <CardDescription>Clients allowed to log in.</CardDescription>
          </CardContent>
        </Card>

        <Card compact variant="danger">
          <CardContent className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Rejected</div>
            <div className="text-2xl font-semibold text-slate-900">{summary.rejected}</div>
            <CardDescription>Clients blocked from logging in.</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col items-stretch">
          <CardTitle>New Client Management</CardTitle>
          <CardDescription>Review newly registered client accounts and keep rejected applications here for follow-up.</CardDescription>
          <div className="relative mt-3 w-full sm:w-80">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none transition focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            rows={pagedClients}
            loading={loading}
            keyField="id"
            caption="Client registrations submitted from the public sign-up form"
            emptyMessage="No pending or rejected client registrations found."
            onRowClick={(row) => openViewModal(row)}
            rowHover={false}
            stickyHeader
            maxHeight="560px"
          />

          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{filteredClients.length === 0 ? 0 : startIndex + 1}</span>-
              <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, filteredClients.length)}</span> of{" "}
              <span className="font-medium">{filteredClients.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canPrev) setCurrentPage((page) => page - 1);
                }}
                disabled={!canPrev}
              >
                Previous
              </Button>
              <div className="text-xs text-slate-600">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canNext) setCurrentPage((page) => page + 1);
                }}
                disabled={!canNext}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={rejectModalOpen}
        onClose={closeRejectModal}
        title="Reject Client Registration"
        description="Enter the missing requirements or reason for rejection. This message will be emailed to the client."
        size="sm"
        closeOnOverlayClick={!rejectBusy}
        footer={
          <>
            <Button variant="secondary" onClick={closeRejectModal} disabled={rejectBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitRejectClient} disabled={!rejectTargetClient?.id || rejectBusy || !rejectReasonTrimmed}>
              {rejectBusy ? "Sending..." : "Reject and Email Client"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {rejectTargetClient ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Rejecting <span className="font-semibold text-slate-900">{fullName(rejectTargetClient) || rejectTargetClient.email}</span>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason / missing requirements</label>
            <textarea
              rows={5}
              value={rejectionReason}
              onChange={(event) => {
                setRejectionReason(event.target.value);
                if (rejectionError) {
                  setRejectionError("");
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/30"
              placeholder="Example: Please upload a clearer valid ID and your latest BIR registration document."
              autoFocus
            />
            <div className="mt-1 text-xs text-slate-500">Be specific so the client knows what needs to be corrected before resubmitting.</div>
          </div>

          {rejectionError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{rejectionError}</div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={viewOpen}
        onClose={closeViewModal}
        title="Client Details"
        description="Review the full registration details before approving or rejecting the account."
        size="lg"
        footer={
          <>
            {viewClient ? (
              <>
                <Button
                  variant="danger"
                  onClick={() => openRejectModal(viewClient)}
                  disabled={actionState.clientId === viewClient.id || !canRejectClient(resolveApprovalStatus(viewClient))}
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  onClick={() => updateClientApproval(viewClient, "Approved")}
                  disabled={actionState.clientId === viewClient.id || !canApproveClient(resolveApprovalStatus(viewClient))}
                >
                  Approve
                </Button>
              </>
            ) : null}
            <Button variant="secondary" onClick={closeViewModal}>
              Close
            </Button>
          </>
        }
      >
        {viewClient ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Client Name</div>
                  <div className="text-lg font-semibold text-slate-900">{fullName(viewClient) || "-"}</div>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusPillClass(resolveApprovalStatus(viewClient))}`}>
                  {resolveApprovalStatus(viewClient)}
                </span>
              </div>
            </div>

            {resolveApprovalStatus(viewClient) === "Rejected" && String(viewClient?.rejection_reason || "").trim() ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs uppercase tracking-wide text-rose-700">Latest rejection reason</div>
                <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-rose-900">{viewClient.rejection_reason}</div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="break-all font-medium text-slate-800">{viewClient?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Contact Number</div>
                <div className="font-medium text-slate-800">{viewClient?.phone || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date Registered</div>
                <div className="font-medium text-slate-800">{formatRegisteredDateTime(viewClient?.registered_at)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Action By</div>
                <div className="font-medium text-slate-800">{formatActionBy(viewClient)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date of Birth</div>
                <div className="font-medium text-slate-800">{viewClient?.date_of_birth || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Civil Status</div>
                <div className="font-medium text-slate-800">{viewClient?.civil_status_type || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">TIN Number</div>
                <div className="font-medium text-slate-800">{viewClient?.tin_no || "-"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-slate-500">Address</div>
                <div className="break-words font-medium text-slate-800">{viewClient?.address || "-"}</div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-900">Business Information</div>
                <div className="text-xs text-slate-500">Latest business details submitted during registration.</div>
              </div>

              {viewLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Loading details...</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">Trade Name</div>
                    <div className="font-medium text-slate-800">{viewBusiness?.business_trade_name || viewBusiness?.business_brand || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Type of Business</div>
                    <div className="font-medium text-slate-800">{viewBusiness?.business_type || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Business Address</div>
                    <div className="break-words font-medium text-slate-800">{viewBusiness?.business_address || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Business Email</div>
                    <div className="break-all font-medium text-slate-800">{viewBusiness?.business_email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Business TIN</div>
                    <div className="font-medium text-slate-800">{viewBusiness?.business_tin || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Business Contact Number</div>
                    <div className="font-medium text-slate-800">{viewBusiness?.business_contact || "-"}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-900">Uploaded Documents</div>
                <div className="text-xs text-slate-500">Supporting files attached during client registration.</div>
              </div>

              {viewLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">Loading documents...</div>
              ) : viewDocuments.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {viewDocuments.map((document) => {
                    const href = documentUrl(document?.filepath);
                    return (
                      <div key={document.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">{document?.document_type_name || "Document"}</div>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block break-all text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                          >
                            {document?.filename || "Open document"}
                          </a>
                        ) : (
                          <div className="mt-1 text-sm font-medium text-slate-700">{document?.filename || "Unavailable"}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  No uploaded documents found for this client.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

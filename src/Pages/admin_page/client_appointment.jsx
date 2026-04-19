import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { api } from "../../services/api";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { requestModuleAccess } from "../../services/api";
import { showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";
import { formatDocumentTypeLabel, normalizeDocumentKey } from "../../utils/document_management";

const PAGE_SIZE = 10;
const WORD_EXT = new Set(["doc", "docx"]);
const EXCEL_EXT = new Set(["xls", "xlsx", "csv"]);
const PDF_EXT = new Set(["pdf"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function fileExtension(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const cleaned = raw.split("?")[0].split("#")[0];
  const idx = cleaned.lastIndexOf(".");
  if (idx < 0) return "";
  return cleaned.slice(idx + 1).toLowerCase();
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
  if (!base) return toBackendFileUrl(raw);

  const params = new URLSearchParams();
  params.set("path", raw);
  params.set("disposition", disposition);
  if (filename) params.set("name", filename);
  return `${base}/appointment_file.php?${params.toString()}`;
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

function isImageAttachment(path, filename) {
  const ext = fileExtension(filename || path);
  return IMAGE_EXT.has(ext);
}

function collectAttachmentEntries(row, description) {
  const desc = String(description || "");
  const attachmentMatches = Array.from(
    desc.matchAll(/^\s*\[Attachment\]\s*([^\r\n]*)\s*$/gim)
  )
    .map((m) => String(m?.[1] || "").trim())
    .filter(Boolean);

  const apiAttachments = Array.isArray(row?.attachments)
    ? row.attachments
        .map((item) => ({
          path: String(item?.path || item?.filepath || "").trim(),
          filename: String(item?.filename || "").trim(),
        }))
        .filter((item) => item.path)
    : [];

  const fallbackPath = String(row?.attachment_path || row?.attachment || "").trim();
  const fallbackFilename = String(row?.document_filename || "").trim();

  const map = new Map();
  const pushEntry = (path, filename = "") => {
    const p = String(path || "").trim();
    if (!p) return;
    const existing = map.get(p) || {};
    const resolvedFilename =
      String(filename || existing.filename || "").trim() ||
      String(p).split("/").pop() ||
      "Uploaded file";
    map.set(p, { path: p, filename: resolvedFilename });
  };

  attachmentMatches.forEach((path) => pushEntry(path));
  apiAttachments.forEach((item) => pushEntry(item.path, item.filename));
  pushEntry(fallbackPath, fallbackFilename);

  return Array.from(map.values());
}

function resolveRowAttachments(row) {
  if (!row) return [];
  const fromRow = Array.isArray(row.attachments) ? row.attachments : [];
  if (fromRow.length > 0) return fromRow;
  if (row.attachmentPath) {
    return [
      {
        path: row.attachmentPath,
        filename:
          row.attachmentFilename ||
          String(row.attachmentPath).split("/").pop() ||
          "Uploaded file",
      },
    ];
  }
  return [];
}

function readMetaLines(text, key) {
  const source = String(text || "");
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*([^\\r\\n]*)\\s*$`, "gim");
  const values = [];
  let match;

  while ((match = re.exec(source)) !== null) {
    const value = String(match[1] || "").trim();
    if (value) {
      values.push(value);
    }
  }

  return values;
}

function extractProcessingDocuments(row, description) {
  const rawValues = [];

  if (Array.isArray(row?.processing_document_labels)) {
    rawValues.push(...row.processing_document_labels);
  }
  if (Array.isArray(row?.processing_documents)) {
    rawValues.push(...row.processing_documents);
  }
  rawValues.push(...readMetaLines(description, "Processing_Document"));
  rawValues.push(...readMetaLines(description, "Processing_Documents"));

  const seen = new Set();
  const labels = [];

  rawValues.forEach((value) => {
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const key = normalizeDocumentKey(item);
        const label = formatDocumentTypeLabel(item);
        const dedupeKey = key || label.toLowerCase();
        if (seen.has(dedupeKey)) {
          return;
        }

        seen.add(dedupeKey);
        labels.push(label);
      });
  });

  return labels;
}

function normalizeStatusLabel(status) {
  const raw = String(status || "").trim();
  if (!raw) return "Pending";
  return raw.toLowerCase() === "active" ? "Approved" : raw;
}

function normalizeAppointmentDecisionStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value || value === "pending" || value === "not started") {
    return "pending";
  }
  if (value === "approved" || value === "active" || value === "started" || value === "in progress") {
    return "approved";
  }
  if (value === "declined" || value === "reject" || value === "rejected" || value === "cancelled" || value === "canceled") {
    return "declined";
  }
  return value;
}

function statusPillClass(status) {
  const value = normalizeAppointmentDecisionStatus(status);
  if (value === "approved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (value === "declined") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (value === "completed") {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function formatActionBy(row) {
  const status = normalizeAppointmentDecisionStatus(row?.statusRaw || row?.status);
  if (!status || status === "pending") return "-";

  const display = String(row?.actionBy || "")
    .trim()
    .replace(/\s+/g, " ");
  const tokens = display ? display.split(" ") : [];
  if (tokens.length > 1 && new Set(tokens.map((token) => token.toLowerCase())).size === 1) {
    return tokens[0];
  }
  return display || "-";
}

export default function AdminAppointmentManagement() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [rows, setRows] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineId, setDeclineId] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [activeFileRow, setActiveFileRow] = useState(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [activeDocumentRow, setActiveDocumentRow] = useState(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [requestingAccess, setRequestingAccess] = useState(false);

  const canApproveAppointments = hasFeatureActionAccess(user, "appointments", "approve", permissions);
  const canDeclineAppointments = hasFeatureActionAccess(user, "appointments", "decline", permissions);
  const canViewAppointmentFiles = hasFeatureActionAccess(user, "appointments", "view-files", permissions);

  const promptAppointmentAccess = async () => {
    if (requestingAccess) {
      return;
    }

    setRequestingAccess(true);
    try {
      const result = await Swal.fire({
        icon: "question",
        title: "Request access?",
        text: "This action is disabled for your role. Do you want to request access to Appointments?",
        showCancelButton: true,
        confirmButtonText: "Request Access",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        reverseButtons: true,
      });

      if (!result.isConfirmed) {
        return;
      }

      const response = await requestModuleAccess("appointments", "Appointments");
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || "Unable to send access request.");
      }

      showSuccessToast({
        title: response?.data?.message || "Access request sent to Admin.",
        duration: 2200,
      });
    } catch (requestError) {
      showErrorToast({
        title: requestError?.response?.data?.message || "Unable to send access request.",
        duration: 2400,
      });
    } finally {
      setRequestingAccess(false);
    }
  };

  const refresh = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoading(true);
      setError("");

      const [res, clientsRes] = await Promise.all([
        api.get("/appointment_list.php"),
        api.get("/client_list.php").catch(() => null),
      ]);

      const list = res?.data?.appointments || res?.data?.rows || res?.data || [];
      const clientRows = clientsRes?.data?.clients || clientsRes?.data || [];
      const clientArr = Array.isArray(clientRows) ? clientRows : [];

      const clientMap = new Map(
        clientArr
          .map((client) => {
            const id = client.Client_ID ?? client.client_id ?? client.id;
            const name =
              client.full_name ||
              client.Full_name ||
              client.name ||
              client.Name ||
              [client.First_name || client.first_name, client.Middle_name || client.middle_name, client.Last_name || client.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
            return [id != null ? String(id) : null, name || null];
          })
          .filter(([id, name]) => id && name)
      );

      const withClientNames = (Array.isArray(list) ? list : []).map((row) => {
        const cid = row.Client_ID ?? row.client_id ?? row.clientId;
        const existingName = row.client_name || row.client || row.Client_name || row.Client_Name;
        if (existingName) return row;
        if (cid != null) {
          const mapped = clientMap.get(String(cid));
          if (mapped) return { ...row, client_name: mapped };
        }
        return row;
      });

      setRows(withClientNames);
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          "Appointment list endpoint is not available yet (appointment_list.php)."
      );
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      await refresh({ silent: false });
    })();

    const intv = setInterval(() => {
      if (mounted) refresh({ silent: true });
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUpdateStatus = async (id, status, reason) => {
    const normalizedStatus = String(status || "").trim().toLowerCase();

    try {
      setUpdatingId(id);
      setError("");

      setRows((prev) =>
        (prev || []).map((row) => {
          const rid = row.id || row.appointment_id || row.Appointment_ID;
          if (String(rid) !== String(id)) return row;
          return {
            ...row,
            status,
            Status: status,
            decline_reason: reason ?? row.decline_reason,
          };
        })
      );

      const res = await api.post("/appointment_update_status.php", {
        appointment_id: id,
        status,
        reason: reason || undefined,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Update failed");
      }

      await refresh({ silent: true });
      showSuccessToast(
        res?.data?.message ||
          (normalizedStatus === "approved"
            ? "Appointment approved successfully."
            : "Appointment declined successfully.")
      );
    } catch (e) {
      await refresh({ silent: true });
      showErrorToast(e?.response?.data?.message || e?.message || "Failed to update appointment.");
    } finally {
      setUpdatingId(null);
    }
  };

  const normalized = useMemo(() => {
    return (rows || []).map((row) => {
      const id = row.id || row.appointment_id || row.Appointment_ID;
      const clientId = row.Client_ID ?? row.client_id ?? row.clientId;
      const client = row.client_name || row.client || row.Client_name || row.Client_Name || "(Unknown client)";
      const date = row.date || row.appointment_date || row.Date || "";

      const desc = String(row.Description ?? row.description ?? "");

      const serviceMatch = desc.match(/^\s*\[Service\]\s*([^\r\n]*)\s*$/im);
      const service =
        row.service ||
        row.service_name ||
        row.Services ||
        row.Name ||
        (serviceMatch ? String(serviceMatch[1]).trim() : "(N/A)");

      const timeMatch = desc.match(/^\s*\[Time\]\s*([0-9]{1,2}:[0-9]{2})\s*$/im);
      const time = row.time || row.appointment_time || row.Time || (timeMatch ? timeMatch[1] : "");

      const notesMatch = desc.match(/^\s*\[Notes\]\s*([^\r\n]*)\s*$/im);
      const notes = row.notes || row.purpose || row.Notes || (notesMatch ? String(notesMatch[1]).trim() : "");

      const meetingMatch = desc.match(/^\s*\[Appointment_Type\]\s*(Online|Onsite)\s*$/im);
      const meetingType = row.meeting_type || row.meetingType || row.Appointment_Type || (meetingMatch ? meetingMatch[1] : "");
      const attachments = collectAttachmentEntries(row, desc);
      const processingDocuments = extractProcessingDocuments(row, desc);
      const latestAttachment = attachments.length
        ? attachments[attachments.length - 1]
        : { path: "", filename: "" };

      const status = row.status || row.Status_name || row.Status || "Pending";
      return {
        id,
        clientId,
        client,
        service,
        meetingType,
        date,
        time,
        notes,
        status,
        actionBy:
          row.action_by_name ||
          row.action_by_username ||
          (Number(row.action_by ?? row.Action_by ?? 0) > 0 ? `User #${row.action_by ?? row.Action_by}` : ""),
        attachmentPath: String(latestAttachment.path || "").trim(),
        attachmentFilename: String(latestAttachment.filename || "").trim(),
        attachments,
        processingDocuments,
      };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((row) => {
      return (
        String(row.client || "").toLowerCase().includes(q) ||
        String(row.service || "").toLowerCase().includes(q) ||
        String(row.meetingType || "").toLowerCase().includes(q) ||
        String(row.date || "").toLowerCase().includes(q) ||
        String(row.time || "").toLowerCase().includes(q) ||
        String(row.notes || "").toLowerCase().includes(q) ||
        String((row.processingDocuments || []).join(" ")).toLowerCase().includes(q) ||
        String(row.status || "").toLowerCase().includes(q)
      );
    });
  }, [normalized, search]);

  const totalPages = Math.max(1, Math.ceil((filtered?.length || 0) / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = (filtered || []).slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const tableRows = useMemo(
    () =>
      pagedRows.map((row) => ({
        id: row.id,
        client: row.client,
        service: row.service,
        type: row.meetingType || "-",
        date: row.date || "-",
        time: row.time || "-",
        notes: row.notes || "-",
        status: normalizeStatusLabel(row.status),
        statusRaw: row.status,
        actionBy: row.actionBy || "",
        attachmentPath: row.attachmentPath || "",
        attachmentFilename: row.attachmentFilename || "",
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        processingDocuments: Array.isArray(row.processingDocuments)
          ? row.processingDocuments
          : [],
      })),
    [pagedRows]
  );

  const openFileCard = (row) => {
    setActiveFileRow(row);
    setFileModalOpen(true);
  };

  const closeFileCard = () => {
    setFileModalOpen(false);
    setActiveFileRow(null);
  };

  const openDocumentCard = (row) => {
    setActiveDocumentRow(row);
    setDocumentModalOpen(true);
  };

  const closeDocumentCard = () => {
    setDocumentModalOpen(false);
    setActiveDocumentRow(null);
  };

  const activeAttachments = useMemo(() => {
    return resolveRowAttachments(activeFileRow);
  }, [activeFileRow]);

  const activeProcessingDocuments = useMemo(() => {
    if (!activeDocumentRow) return [];
    return Array.isArray(activeDocumentRow.processingDocuments)
      ? activeDocumentRow.processingDocuments
      : [];
  }, [activeDocumentRow]);

  const activeDocumentAttachments = useMemo(() => {
    return resolveRowAttachments(activeDocumentRow);
  }, [activeDocumentRow]);

  const declineTargetRow = useMemo(
    () => normalized.find((row) => String(row.id) === String(declineId)) || null,
    [declineId, normalized]
  );
  const canSubmitDecline =
    Boolean(declineId) && normalizeAppointmentDecisionStatus(declineTargetRow?.status) === "pending";

  const columns = [
    { key: "client", header: "Client", width: "17%" },
    { key: "service", header: "Service", width: "16%" },
    { key: "type", header: "Type", width: "11%" },
    { key: "date", header: "Date", width: "11%" },
    { key: "time", header: "Time", width: "9%" },
    {
      key: "notes",
      header: "Notes",
      width: "18%",
      render: (value) => <div className="line-clamp-2">{value}</div>,
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (value) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusPillClass(value)}`}>
          {value}
        </span>
      ),
    },
    {
      key: "actionBy",
      header: "Action By",
      width: "11%",
      render: (_, row) => <span className="break-words text-xs text-slate-700">{formatActionBy(row)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      width: "14%",
      render: (_, row) => {
        const statusLower = normalizeAppointmentDecisionStatus(row.statusRaw || row.status);
        const disabled = updatingId === row.id;
        const isPending = statusLower === "pending";
        const approveDisabled = disabled || !isPending;
        const declineDisabled = disabled || !isPending;
        return (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              size="sm"
              variant="success"
              aria-label={`Approve ${row.client}`}
              title={
                !canApproveAppointments
                  ? "Request access"
                  : isPending
                    ? "Approve"
                    : "Only pending requests can be approved"
              }
              disabled={approveDisabled}
              aria-disabled={approveDisabled || !canApproveAppointments}
              className={!canApproveAppointments ? "cursor-not-allowed opacity-60" : ""}
              onClick={() => {
                if (approveDisabled) return;
                if (canApproveAppointments) {
                  onUpdateStatus(row.id, "Approved");
                  return;
                }
                void promptAppointmentAccess();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
              </svg>
            </IconButton>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              title={!canViewAppointmentFiles ? "Request access" : "View Docs"}
              disabled={disabled}
              aria-disabled={disabled || !canViewAppointmentFiles}
              className={!canViewAppointmentFiles ? "cursor-not-allowed opacity-60" : ""}
              onClick={() => {
                if (disabled) return;
                if (!canViewAppointmentFiles) {
                  void promptAppointmentAccess();
                  return;
                }
                openDocumentCard(row);
              }}
            >
              View Docs
            </Button>

            <IconButton
              size="sm"
              variant="secondary"
              aria-label={`Decline ${row.client}`}
              title={
                !canDeclineAppointments
                  ? "Request access"
                  : isPending
                    ? "Decline"
                    : "Only pending requests can be declined"
              }
              disabled={declineDisabled}
              aria-disabled={declineDisabled || !canDeclineAppointments}
              className={!canDeclineAppointments ? "cursor-not-allowed opacity-60" : ""}
              onClick={() => {
                if (declineDisabled) return;
                if (!canDeclineAppointments) {
                  void promptAppointmentAccess();
                  return;
                }
                setDeclineId(row.id);
                setDeclineReason("");
                setDeclineOpen(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8Z" />
                <path d="M12 6a1 1 0 0 0-1 1v5.586l-2.293 2.293a1 1 0 1 0 1.414 1.414l2.586-2.586A1 1 0 0 0 13 13V7a1 1 0 0 0-1-1Z" />
              </svg>
            </IconButton>

            <IconButton
              size="sm"
              variant="secondary"
              aria-label={`View file for ${row.client}`}
              title={
                canViewAppointmentFiles
                  ? (Array.isArray(row.attachments) ? row.attachments.length : 0) > 0
                    ? "View Files"
                    : "No file uploaded"
                  : "Request access"
              }
              disabled={disabled}
              aria-disabled={disabled || !canViewAppointmentFiles}
              className={!canViewAppointmentFiles ? "cursor-not-allowed opacity-60" : ""}
              onClick={() => {
                if (disabled) return;
                if (!canViewAppointmentFiles) {
                  void promptAppointmentAccess();
                  return;
                }
                openFileCard(row);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5c-4.635 0-8.58 2.99-10 7.5 1.42 4.51 5.365 7.5 10 7.5s8.58-2.99 10-7.5c-1.42-4.51-5.365-7.5-10-7.5Zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z" />
                <circle cx="12" cy="12" r="2.25" />
              </svg>
            </IconButton>
          </div>
        );
      },
    },
  ];

  const closeDeclineModal = () => {
    setDeclineOpen(false);
    setDeclineId(null);
    setDeclineReason("");
  };

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader>
          <CardTitle>Appointment Requests</CardTitle>
          <CardDescription>Review, approve, decline, and update client appointments.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative w-full sm:w-80">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search appointments..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <DataTable
            columns={columns}
            rows={error ? [] : tableRows}
            keyField="id"
            loading={loading}
            compact
            striped={false}
            emptyMessage={error ? "Unable to load appointments." : "No appointment requests."}
            className="shadow-none"
          />

          {!loading && !error && (
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="text-xs text-slate-600">
                Showing <span className="font-medium">{filtered.length === 0 ? 0 : startIndex + 1}</span>-
                <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, filtered.length)}</span> of{" "}
                <span className="font-medium">{filtered.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canPrev) setCurrentPage((p) => p - 1);
                  }}
                  disabled={!canPrev}
                >
                  Previous
                </Button>

                <div className="text-xs text-slate-600">
                  Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canNext) setCurrentPage((p) => p + 1);
                  }}
                  disabled={!canNext}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={declineOpen}
        onClose={closeDeclineModal}
        title="Decline Appointment"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeDeclineModal}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!canSubmitDecline || updatingId === declineId}
              onClick={async () => {
                const id = declineId;
                const reason = declineReason;
                closeDeclineModal();
                await onUpdateStatus(id, "Declined", reason);
              }}
            >
              Decline
            </Button>
          </>
        }
      >
        <div>
          {!canSubmitDecline && declineId ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              This appointment has already been processed and can no longer be declined.
            </div>
          ) : null}
          <label className="mb-1 block text-xs font-medium text-slate-600">Reason (optional)</label>
          <textarea
            rows={4}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            disabled={!canSubmitDecline || updatingId === declineId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            placeholder={
              canSubmitDecline ? "Enter reason for declining..." : "This appointment can no longer be changed."
            }
          />
        </div>
      </Modal>

      <Modal
        open={documentModalOpen}
        onClose={closeDocumentCard}
        title="Client Documents"
        description="Review the requested processing documents and uploaded files for this appointment."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeDocumentCard}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Client</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {activeDocumentRow?.client || "-"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Service</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {activeDocumentRow?.service || "-"}
            </div>
          </div>

          {activeDocumentAttachments.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700">
                Uploaded Files ({activeDocumentAttachments.length})
              </div>
              <div className="mt-2 space-y-2">
                {activeDocumentAttachments.map((item, idx) => {
                  const filePath = String(item?.path || "").trim();
                  const fileName =
                    String(item?.filename || "").trim() ||
                    String(filePath).split("/").pop() ||
                    `Uploaded file ${idx + 1}`;
                  const openUrl = toOpenFileUrl(filePath, fileName);
                  const previewUrl = toAppointmentFileUrl(filePath, {
                    disposition: "inline",
                    filename: fileName,
                  });
                  const downloadUrl = toAppointmentFileUrl(filePath, {
                    disposition: "attachment",
                    filename: fileName,
                  });
                  const showImagePreview = isImageAttachment(filePath, fileName);

                  return (
                    <div
                      key={`${filePath}-${idx}`}
                      className="rounded-md border border-emerald-200/80 bg-white/80 px-3 py-2"
                    >
                      <div className="break-all text-sm font-medium text-emerald-800">
                        {fileName}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-indigo-700 underline"
                        >
                          Open file
                        </a>
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-slate-700 underline"
                        >
                          Download
                        </a>
                      </div>
                      {showImagePreview ? (
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block overflow-hidden rounded-md border border-emerald-200/70 bg-white"
                          title={`Preview ${fileName}`}
                        >
                          <img
                            src={previewUrl}
                            alt={fileName}
                            loading="lazy"
                            className="max-h-64 w-full object-contain"
                          />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeProcessingDocuments.length > 0 ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-indigo-700">
                Requested Documents ({activeProcessingDocuments.length})
              </div>
              <div className="mt-2 space-y-2">
                {activeProcessingDocuments.map((item) => (
                  <div
                    key={item}
                    className="rounded-md border border-indigo-200/80 bg-white/90 px-3 py-2 text-sm font-medium text-slate-800"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeDocumentAttachments.length === 0 && activeProcessingDocuments.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No uploaded files or processing documents were found for this appointment.
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={fileModalOpen}
        onClose={closeFileCard}
        title="Client Uploaded File"
        description="Review and download files attached to this appointment."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeFileCard}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Client</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {activeFileRow?.client || "-"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Service</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {activeFileRow?.service || "-"}
            </div>
          </div>

          {activeAttachments.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700">
                Files ({activeAttachments.length})
              </div>
              <div className="mt-2 space-y-2">
                {activeAttachments.map((item, idx) => {
                  const filePath = String(item?.path || "").trim();
                  const fileName =
                    String(item?.filename || "").trim() ||
                    String(filePath).split("/").pop() ||
                    `Uploaded file ${idx + 1}`;
                  const openUrl = toOpenFileUrl(filePath, fileName);
                  const previewUrl = toAppointmentFileUrl(filePath, {
                    disposition: "inline",
                    filename: fileName,
                  });
                  const downloadUrl = toAppointmentFileUrl(filePath, {
                    disposition: "attachment",
                    filename: fileName,
                  });
                  const showImagePreview = isImageAttachment(filePath, fileName);

                  return (
                    <div
                      key={`${filePath}-${idx}`}
                      className="rounded-md border border-emerald-200/80 bg-white/80 px-3 py-2"
                    >
                      <div className="break-all text-sm font-medium text-emerald-800">
                        {fileName}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-indigo-700 underline"
                        >
                          Open file
                        </a>
                        <a
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-slate-700 underline"
                        >
                          Download
                        </a>
                      </div>
                      {showImagePreview ? (
                        <a
                          href={openUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block overflow-hidden rounded-md border border-emerald-200/70 bg-white"
                          title={`Preview ${fileName}`}
                        >
                          <img
                            src={previewUrl}
                            alt={fileName}
                            loading="lazy"
                            className="max-h-64 w-full object-contain"
                          />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              No uploaded files found for this appointment.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

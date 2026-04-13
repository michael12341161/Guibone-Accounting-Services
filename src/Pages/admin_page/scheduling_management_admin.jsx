import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import { fetchConsultationSlots, saveConsultationSlots } from "../../services/consultationSlots";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { formatDate } from "../../utils/helpers";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";
import {
  DEFAULT_CONSULTATION_TIME_SLOTS,
  getConfiguredConsultationTimesForDate,
  hasConfiguredConsultationSlots,
  normalizeConsultationSlots,
  toConsultationTimeLabel,
} from "../../utils/consultationSlots";

const POLL_MS = 10000;
const PAGE_SIZE = 10;

const normalizeStatus = (status) => {
  const value = String(status ?? "").trim();
  if (!value) return "Pending";

  const lower = value.toLowerCase();
  if (lower === "active") return "Approved";
  if (lower === "pending") return "Pending";
  if (lower === "approved") return "Approved";
  if (lower === "declined") return "Declined";
  if (lower === "completed") return "Completed";
  return value;
};

const statusPillClass = (status) => {
  const value = normalizeStatus(status).toLowerCase();
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "declined") return "bg-rose-50 text-rose-700 border-rose-200";
  if (value === "pending") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

const formatActionBy = (row) => {
  const status = normalizeStatus(row?.statusRaw || row?.status).toLowerCase();
  if (!status || status === "pending") return "-";

  const display = String(row?.actionBy || "").trim();
  return display || "-";
};

function canUpdateConsultationDecision(status) {
  return normalizeStatus(status).toLowerCase() === "pending";
}

function canRescheduleConsultation(status) {
  const value = normalizeStatus(status).toLowerCase();
  return value !== "declined" && value !== "completed";
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
    ? toConsultationTimeLabel(value)
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
                  {toConsultationTimeLabel(slot)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SchedulingManagementAdmin() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const canApproveConsultations = hasFeatureActionAccess(user, "scheduling", "approve", permissions);
  const canDeclineConsultations = hasFeatureActionAccess(user, "scheduling", "decline", permissions);
  const canRescheduleConsultations = hasFeatureActionAccess(user, "scheduling", "reschedule", permissions);
  const canConfigureConsultationTimes = hasFeatureActionAccess(user, "scheduling", "configure-times", permissions);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [consultationSlots, setConsultationSlots] = useState([]);
  const [slotForm, setSlotForm] = useState({ time: "" });
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsSaving, setSlotsSaving] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [slotNotice, setSlotNotice] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { id, status }
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    date: "",
    time: "",
    reason: "",
  });
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  useErrorToast(error);
  useErrorToast(slotError);
  useErrorToast(rescheduleError);
  const [rescheduleNotice, setRescheduleNotice] = useState("");

  const needsConsultationSlots =
    canConfigureConsultationTimes || canRescheduleConsultations;

  const refresh = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoading(true);
      setError("");

      const res = await api.get("/scheduling_list.php");
      const list = res?.data?.rows || res?.data?.scheduling || res?.data || [];
      const arr = Array.isArray(list) ? list : [];

      const extracted = arr.map((row) => {
        const schedulingId =
          row.Consultation_ID ??
          row.consultation_id ??
          row.Scheduling_ID ??
          row.scheduling_id ??
          row.SchedulingId ??
          row.id;
        const clientId = row.Client_ID ?? row.client_id ?? null;

        return {
          schedulingId,
          clientId,
          clientName: row.Client_name ?? row.client_name ?? row.clientName ?? "(Unknown client)",
          service:
            row.Consultation_Service ??
            row.consultation_service ??
            row.Name ??
            row.service ??
            row.service_name ??
            "Consultation",
          date: row.Date ?? row.date ?? "",
          time: row.Time ?? row.time ?? "",
          meetingType: row.Appointment_Type ?? row.appointment_type ?? row.meetingType ?? "",
          notes: row.Notes ?? row.notes ?? "",
          rescheduleReason:
            row.Reschedule_Reason ?? row.reschedule_reason ?? "",
          status: normalizeStatus(row.Status ?? row.status ?? "Pending"),
          actionBy:
            row.action_by_name ||
            row.action_by_username ||
            (Number(row.action_by ?? row.Action_by ?? 0) > 0 ? `User #${row.action_by ?? row.Action_by}` : ""),
        };
      });

      setRows(extracted);
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          "Consultation list is not available yet. Ensure scheduling_list.php is reachable."
      );
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadConsultationTimeSlots = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setSlotsLoading(true);
      setSlotError("");

      const response = await fetchConsultationSlots();
      setConsultationSlots(response?.data?.slots || []);
    } catch (e) {
      setSlotError(e?.response?.data?.message || e?.message || "Unable to load consultation times.");
      setConsultationSlots([]);
    } finally {
      if (!silent) setSlotsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (needsConsultationSlots) {
        await Promise.all([
          refresh({ silent: false }),
          loadConsultationTimeSlots({ silent: false }),
        ]);
        return;
      }

      setSlotsLoading(false);
      await refresh({ silent: false });
    })();

    const intv = setInterval(() => {
      if (mounted) refresh({ silent: true });
    }, POLL_MS);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsConsultationSlots]);

  const hasManagedConsultationSlots = useMemo(
    () => hasConfiguredConsultationSlots(consultationSlots),
    [consultationSlots]
  );

  const configuredRescheduleSlotsForDate = useMemo(
    () =>
      getConfiguredConsultationTimesForDate(
        consultationSlots,
        rescheduleForm.date
      ),
    [consultationSlots, rescheduleForm.date]
  );

  const onUpdateStatus = async (schedulingId, status) => {
    const normalizedStatus = String(status || "").trim().toLowerCase();
    const targetRow = (rows || []).find(
      (row) => String(row.schedulingId) === String(schedulingId)
    );
    if (
      (normalizedStatus === "approved" || normalizedStatus === "declined") &&
      targetRow &&
      !canUpdateConsultationDecision(targetRow.status)
    ) {
      showErrorToast("Only pending consultations can be approved or declined.");
      return;
    }

    try {
      setUpdatingId(schedulingId);
      setError("");

      setRows((prev) =>
        (prev || []).map((row) =>
          String(row.schedulingId) === String(schedulingId) ? { ...row, status } : row
        )
      );

      const res = await api.post("/scheduling_update_status.php", {
        scheduling_id: schedulingId,
        status,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Update failed");
      }

      await refresh({ silent: true });
      showSuccessToast(
        res?.data?.message ||
          (normalizedStatus === "approved"
            ? "Consultation approved successfully."
            : "Consultation declined successfully.")
      );
    } catch (e) {
      await refresh({ silent: true });
      showErrorToast(e?.response?.data?.message || e?.message || "Failed to update consultation.");
    } finally {
      setUpdatingId(null);
    }
  };

  const normalized = useMemo(
    () =>
      (rows || []).map((row) => ({
        ...row,
        status: normalizeStatus(row.status),
      })),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return normalized;

    return normalized.filter((row) => {
      return (
        String(row.clientName || "").toLowerCase().includes(q) ||
        String(row.service || "").toLowerCase().includes(q) ||
        String(row.date || "").toLowerCase().includes(q) ||
        String(row.time || "").toLowerCase().includes(q) ||
        String(row.meetingType || "").toLowerCase().includes(q) ||
        String(row.notes || "").toLowerCase().includes(q) ||
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

  const consultationAvailability = useMemo(
    () =>
      (normalized || []).map((row) => ({
        schedulingId: row.schedulingId,
        date: row.date ? String(row.date).slice(0, 10) : "",
        time: row.time ? String(row.time).slice(0, 5) : "",
        status: normalizeStatus(row.status),
      })),
    [normalized]
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

  const tableRows = useMemo(
    () =>
      pagedRows.map((row) => ({
        id: row.schedulingId,
        schedulingId: row.schedulingId,
        clientId: row.clientId,
        client: row.clientName,
        service: row.service || "Consultation",
        date: row.date || "-",
        time: row.time || "-",
        type: row.meetingType || "-",
        notes: row.notes || "-",
        rescheduleReason: row.rescheduleReason || "",
        status: normalizeStatus(row.status),
        statusRaw: row.status,
        actionBy: row.actionBy || "",
      })),
    [pagedRows]
  );

  const confirmTargetRow = useMemo(
    () =>
      normalized.find(
        (row) => String(row.schedulingId) === String(confirmAction?.id)
      ) || null,
    [confirmAction?.id, normalized]
  );
  const canConfirmDecision =
    Boolean(confirmAction) && canUpdateConsultationDecision(confirmTargetRow?.status);

  const visibleRowActionCount = [canApproveConsultations, canDeclineConsultations, canRescheduleConsultations].filter(Boolean).length;
  const hasRowActions = visibleRowActionCount > 0;
  const actionColumnWidth =
    visibleRowActionCount >= 3 ? "12%" : visibleRowActionCount === 2 ? "10%" : "8%";

  const columns = [
    { key: "client", header: "Client", width: "16%" },
    { key: "service", header: "Service", width: "14%" },
    { key: "date", header: "Date", width: "12%" },
    { key: "time", header: "Time", width: "10%" },
    { key: "type", header: "Type", width: "10%" },
    {
      key: "notes",
      header: "Notes",
      width: "20%",
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
      width: "12%",
      render: (_, row) => <span className="break-words text-xs text-slate-700">{formatActionBy(row)}</span>,
    },
    ...(hasRowActions
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right",
            width: actionColumnWidth,
            render: (_, row) => {
              const isPending = canUpdateConsultationDecision(row.status);
              const disabled = updatingId === row.id;
              const canRescheduleRow =
                canRescheduleConsultations &&
                !!row.clientId &&
                canRescheduleConsultation(row.status);

              return (
                <div className="flex items-center justify-end gap-1">
                  {canRescheduleConsultations ? (
                    <IconButton
                      size="sm"
                      variant="secondary"
                      aria-label={`Reschedule ${row.client}`}
                      title={
                        canRescheduleRow
                          ? "Reschedule"
                          : "Only pending or approved consultations can be rescheduled"
                      }
                      disabled={disabled || !canRescheduleRow}
                      onClick={() => openRescheduleModal(row)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 3-6.708" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4v4h4" />
                      </svg>
                    </IconButton>
                  ) : null}

                  {canApproveConsultations ? (
                    <IconButton
                      size="sm"
                      variant="success"
                      aria-label={`Approve ${row.client}`}
                      title={isPending ? "Approve" : "Only pending requests can be approved"}
                      disabled={disabled || !isPending}
                      onClick={() => {
                        setConfirmAction({ id: row.id, status: "Approved" });
                        setConfirmOpen(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    </IconButton>
                  ) : null}

                  {canDeclineConsultations ? (
                    <IconButton
                      size="sm"
                      variant="secondary"
                      aria-label={`Decline ${row.client}`}
                      title={isPending ? "Decline" : "Only pending requests can be declined"}
                      disabled={disabled || !isPending}
                      onClick={() => {
                        setConfirmAction({ id: row.id, status: "Declined" });
                        setConfirmOpen(true);
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8Z" />
                        <path d="M12 6a1 1 0 0 0-1 1v5.586l-2.293 2.293a1 1 0 1 0 1.414 1.414l2.586-2.586A1 1 0 0 0 13 13V7a1 1 0 0 0-1-1Z" />
                      </svg>
                    </IconButton>
                  ) : null}
                </div>
              );
            },
          },
        ]
      : []),
  ];

  const closeConfirmModal = () => {
    if (updatingId) return;
    setConfirmOpen(false);
    setConfirmAction(null);
  };

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

  const openRescheduleModal = (row) => {
    if (!canRescheduleConsultations) return;

    setRescheduleError("");
    setRescheduleNotice("");
    setRescheduleTarget({
      schedulingId: row.schedulingId ?? row.id,
      clientId: row.clientId,
      clientName: row.client,
      service: row.service || "Consultation",
      date: row.date && row.date !== "-" ? row.date : "",
      time: row.time && row.time !== "-" ? String(row.time).slice(0, 5) : "",
      status: row.status,
      reason:
        row.rescheduleReason ||
        row.reschedule_reason ||
        "",
    });
    setRescheduleForm({
      date: row.date && row.date !== "-" ? row.date : "",
      time: row.time && row.time !== "-" ? String(row.time).slice(0, 5) : "",
      reason:
        row.rescheduleReason ||
        row.reschedule_reason ||
        "",
    });
    setIsRescheduleOpen(true);

    if (needsConsultationSlots) {
      loadConsultationTimeSlots({ silent: false });
    }
    refresh({ silent: true });
  };

  const closeRescheduleModal = () => {
    if (rescheduling) return;
    setRescheduleError("");
    setRescheduleNotice("");
    setRescheduleTarget(null);
    setRescheduleForm({ date: "", time: "", reason: "" });
    setIsRescheduleOpen(false);
  };

  const onRescheduleSubmit = async (event) => {
    event.preventDefault();
    setRescheduleError("");
    setRescheduleNotice("");

    if (!rescheduleTarget?.schedulingId) {
      setRescheduleError("Cannot reschedule: missing consultation id.");
      return;
    }

    if (!rescheduleTarget?.clientId) {
      setRescheduleError("Cannot reschedule: missing client reference.");
      return;
    }

    if (!rescheduleForm.date || !rescheduleForm.time) {
      setRescheduleError("Please choose a new consultation date and time slot.");
      return;
    }
    if (!String(rescheduleForm.reason || "").trim()) {
      setRescheduleError("Please add a reason for rescheduling.");
      return;
    }

    const nextTime = String(rescheduleForm.time || "").slice(0, 5);
    if (!availableRescheduleSlots.includes(nextTime)) {
      setRescheduleError("Please choose an available consultation time slot.");
      return;
    }

    try {
      setRescheduling(true);

      const response = await api.post("/scheduling_reschedule.php", {
        scheduling_id: rescheduleTarget.schedulingId,
        client_id: rescheduleTarget.clientId,
        date: rescheduleForm.date,
        time: nextTime,
        reason: String(rescheduleForm.reason || "").trim(),
      });

      if (!response?.data?.success) {
        throw new Error(
          response?.data?.message || "Failed to reschedule consultation."
        );
      }

      setRescheduleNotice(
        response?.data?.message ||
          "Consultation rescheduled. The update is pending confirmation."
      );
      setIsRescheduleOpen(false);
      setRescheduleTarget(null);
      setRescheduleForm({ date: "", time: "", reason: "" });
      await refresh({ silent: true });
      await loadConsultationTimeSlots({ silent: true });
    } catch (e) {
      setRescheduleError(
        e?.response?.data?.message ||
          e?.message ||
          "Consultation reschedule endpoint is not available yet (scheduling_reschedule.php)."
      );
    } finally {
      setRescheduling(false);
    }
  };

  const openConsultationTimeModal = () => {
    if (!canConfigureConsultationTimes) return;
    setSlotError("");
    setSlotNotice("");
    setSlotModalOpen(true);
    loadConsultationTimeSlots({ silent: false });
  };

  const closeConsultationTimeModal = () => {
    if (slotsSaving) return;
    setSlotModalOpen(false);
    setSlotForm({ time: "" });
    setSlotError("");
    setSlotNotice("");
  };

  const addConsultationTimeSlot = () => {
    setSlotError("");
    setSlotNotice("");

    const [nextSlot] = normalizeConsultationSlots([slotForm]);
    if (!nextSlot) {
      setSlotError("Choose a valid consultation time.");
      return;
    }

    const exists = consultationSlots.some(
      (slot) => slot.time === nextSlot.time
    );
    if (exists) {
      setSlotError("That consultation time is already in the list.");
      return;
    }

    setConsultationSlots((current) =>
      normalizeConsultationSlots([...current, nextSlot])
    );
    setSlotForm({ time: "" });
  };

  const removeConsultationTimeSlot = (slotToRemove) => {
    setSlotError("");
    setSlotNotice("");
    setConsultationSlots((current) =>
      current.filter((slot) => slot.time !== slotToRemove.time)
    );
  };

  const onSaveConsultationTimeSlots = async () => {
    try {
      setSlotsSaving(true);
      setSlotError("");
      setSlotNotice("");

      const response = await saveConsultationSlots(consultationSlots);
      const savedSlots = response?.data?.slots || [];
      setConsultationSlots(savedSlots);
      setSlotNotice(
        savedSlots.length > 0
          ? response?.data?.message || "Consultation times saved successfully."
          : "Consultation times cleared. Clients will fall back to the default consultation schedule."
      );
    } catch (e) {
      setSlotError(e?.response?.data?.message || e?.message || "Unable to save consultation times.");
    } finally {
      setSlotsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader
          action={canConfigureConsultationTimes ? (
            <Button type="button" size="sm" onClick={openConsultationTimeModal}>
              Consultation Time
            </Button>
          ) : null}
        >
          <CardTitle>Consultation Requests</CardTitle>
          <CardDescription>Review, approve, and decline consultation requests.</CardDescription>
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
              placeholder="Search consultation..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {rescheduleNotice ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {rescheduleNotice}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            rows={error ? [] : tableRows}
            keyField="id"
            loading={loading}
            compact
            striped={false}
            emptyMessage={error ? "Unable to load consultation requests." : "No consultation requests."}
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
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canNext) setCurrentPage((page) => page + 1);
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
        open={confirmOpen && !!confirmAction}
        onClose={closeConfirmModal}
        title="Confirm Action"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeConfirmModal} disabled={!!updatingId}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={String(confirmAction?.status).toLowerCase() === "approved" ? "success" : "danger"}
              disabled={!!updatingId || !confirmAction || !canConfirmDecision}
              onClick={async () => {
                const action = confirmAction;
                if (!action || !canConfirmDecision) return;
                setConfirmOpen(false);
                setConfirmAction(null);
                await onUpdateStatus(action.id, action.status);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {canConfirmDecision
            ? String(confirmAction?.status).toLowerCase() === "approved"
              ? "Approve this consultation request?"
              : "Decline this consultation request?"
            : `This consultation request has already been ${String(
                normalizeStatus(confirmTargetRow?.status || "processed")
              ).toLowerCase()} and can no longer be updated.`}
        </p>
      </Modal>

      <Modal
        open={isRescheduleOpen}
        onClose={closeRescheduleModal}
        title="Reschedule Consultation"
        description="Choose a new date and consultation slot for this client."
        size="md"
      >
        <form onSubmit={onRescheduleSubmit} className="space-y-4">
          {rescheduleError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {rescheduleError}
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Client
                </div>
                <div className="mt-1 text-slate-900">
                  {rescheduleTarget?.clientName || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Service
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
                  {rescheduleTarget?.date
                    ? formatDate(rescheduleTarget.date, undefined, rescheduleTarget.date)
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Current Time
                </div>
                <div className="mt-1 text-slate-900">
                  {rescheduleTarget?.time
                    ? toConsultationTimeLabel(rescheduleTarget.time)
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
                onChange={(event) =>
                  setRescheduleForm((current) => ({
                    ...current,
                    date: event.target.value,
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
                loading={slotsLoading}
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
            Rescheduling updates the consultation time and sends it back to pending confirmation.
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

      {canConfigureConsultationTimes ? (
        <Modal
          open={slotModalOpen}
          onClose={closeConsultationTimeModal}
          title="Consultation Time"
          description="Add the time slots clients can book for consultation requests on any date."
          size="lg"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={closeConsultationTimeModal} disabled={slotsSaving}>
                Close
              </Button>
              <Button type="button" variant="success" onClick={onSaveConsultationTimeSlots} disabled={slotsLoading || slotsSaving}>
                {slotsSaving ? "Saving..." : "Save Times"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Client consultation availability</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Add the consultation times you want clients to choose from. These times apply to every consultation
                date. If you leave this list empty, clients will continue to see the current default consultation
                schedule.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Available time</label>
                <input
                  type="time"
                  name="time"
                  value={slotForm.time}
                  onChange={(event) => {
                    setSlotError("");
                    setSlotNotice("");
                    setSlotForm((current) => ({ ...current, time: event.target.value }));
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full md:w-auto"
                  onClick={addConsultationTimeSlot}
                  disabled={slotsLoading || slotsSaving}
                >
                  Add Time
                </Button>
              </div>
            </div>

            {slotError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {slotError}
              </div>
            ) : null}

            {slotNotice ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {slotNotice}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Saved consultation times</p>
                  <p className="text-xs text-slate-500">Clients can book these times on any consultation date.</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  {consultationSlots.length} total
                </span>
              </div>

              {slotsLoading ? (
                <div className="px-4 py-6 text-sm text-slate-500">Loading consultation times...</div>
              ) : consultationSlots.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  No consultation times saved yet. Add a time above to make it available to clients on any date.
                </div>
              ) : (
                <div className="max-h-[22rem] space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-3">
                  {consultationSlots.map((slot) => (
                    <div
                      key={slot.time}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{toConsultationTimeLabel(slot.time)}</p>
                        <p className="text-xs text-slate-500">Applies to all dates</p>
                      </div>

                      <IconButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Remove ${slot.time}`}
                        title="Remove time"
                        onClick={() => removeConsultationTimeSlot(slot)}
                        disabled={slotsSaving}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" />
                        </svg>
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

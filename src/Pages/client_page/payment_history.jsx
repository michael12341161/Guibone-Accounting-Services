import React, { useEffect, useMemo, useState } from "react";
import { Eye, ImageIcon } from "lucide-react";
import { Button } from "../../components/UI/buttons";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useAuth } from "../../hooks/useAuth";
import { api, resolveBackendAssetUrl } from "../../services/api";
import { useErrorToast } from "../../utils/feedback";

const PAGE_SIZE = 10;

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

function formatPaymentDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
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

function getPaymentStatusClasses(status) {
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

  return "border-slate-200 bg-slate-50 text-slate-600";
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

function toSortTime(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  const parsed = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}

function buildPaymentHistoryRow(appointment) {
  const appointmentId = getAppointmentId(appointment);
  const payment = appointment?.payment && typeof appointment.payment === "object" ? appointment.payment : {};
  const screenshotPath = String(
    appointment?.payment_screenshot || payment?.screenshot || ""
  ).trim();
  const screenshotUrl = screenshotPath ? resolveBackendAssetUrl(screenshotPath) : "";
  const paymentStatus = normalizePaymentStatus(
    appointment?.payment_status_name || appointment?.payment_status || payment?.status_name
  );

  return {
    id: payment?.id || `payment-history-${appointmentId || getAppointmentLabel(appointment)}`,
    paymentId: payment?.id || null,
    appointmentId: appointmentId || null,
    appointmentLabel: getAppointmentLabel(appointment),
    service: String(
      appointment?.service_name || appointment?.service || appointment?.Name || "Appointment"
    ).trim() || "Appointment",
    appointmentDate: appointment?.date || appointment?.Date || "",
    paymentDate: appointment?.payment_date || payment?.date || "",
    paymentMethod:
      String(appointment?.payment_method_name || payment?.payment_method_name || "").trim() || "-",
    paymentStatus,
    screenshotUrl,
  };
}

export default function PaymentHistoryPage() {
  const { user: authUser } = useAuth();
  const currentUser = authUser || readStoredSessionUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeRow, setActiveRow] = useState(null);

  useErrorToast(error);

  useEffect(() => {
    let mounted = true;

    async function loadPaymentHistory({ silent } = { silent: false }) {
      try {
        if (!silent && mounted) {
          setLoading(true);
        }

        if (mounted) {
          setError("");
        }

        const queryParams = {
          client_id: currentUser?.client_id || currentUser?.Client_ID || undefined,
          client_username: currentUser?.username || undefined,
        };

        const response = await api.get("appointment_list.php", { params: queryParams });
        const appointmentRows = Array.isArray(response?.data?.appointments)
          ? response.data.appointments
          : Array.isArray(response?.data?.rows)
            ? response.data.rows
            : Array.isArray(response?.data)
              ? response.data
              : [];

        const nextRows = appointmentRows
          .filter((appointment) => !isConsultationAppointment(appointment))
          .filter((appointment) => {
            const payment = appointment?.payment || null;
            const hasPayment = Boolean(appointment?.payment_exists ?? payment?.exists);
            if (!hasPayment) {
              return false;
            }

            const status = normalizePaymentStatus(
              appointment?.payment_status_name || appointment?.payment_status || payment?.status_name
            );
            return getPaymentStatusKey(status) === "paid";
          })
          .map(buildPaymentHistoryRow)
          .sort((left, right) => {
            const leftTime = toSortTime(left.paymentDate || left.appointmentDate);
            const rightTime = toSortTime(right.paymentDate || right.appointmentDate);
            return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
          });

        if (!mounted) {
          return;
        }

        setRows(nextRows);
      } catch (requestError) {
        if (!mounted) {
          return;
        }

        setRows([]);
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            "Unable to load payment history right now."
        );
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    }

    void loadPaymentHistory({ silent: false });
    const intervalId = setInterval(() => {
      if (mounted) {
        void loadPaymentHistory({ silent: true });
      }
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [currentUser?.client_id, currentUser?.Client_ID, currentUser?.username]);

  const filteredRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => {
      return (
        String(row.appointmentLabel || "").toLowerCase().includes(query) ||
        String(row.service || "").toLowerCase().includes(query) ||
        String(row.paymentMethod || "").toLowerCase().includes(query) ||
        String(row.paymentStatus || "").toLowerCase().includes(query) ||
        String(row.paymentDate || "").toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const columns = [
    {
      key: "appointmentLabel",
      header: "Appointment",
      width: "38%",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{row.appointmentLabel}</div>
          <div className="text-xs text-slate-500">{row.service}</div>
        </div>
      ),
    },
    { key: "paymentMethod", header: "Method", width: "16%" },
    {
      key: "paymentStatus",
      header: "Status",
      width: "14%",
      render: (value) => (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getPaymentStatusClasses(value)}`}
        >
          {normalizePaymentStatus(value)}
        </span>
      ),
    },
    {
      key: "paymentDate",
      header: "Paid On",
      width: "16%",
      render: (value) => formatPaymentDate(value),
    },
    {
      key: "receipt",
      header: "Receipt",
      width: "16%",
      render: (_, row) =>
        row.screenshotUrl ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setActiveRow(row);
              setPreviewOpen(true);
            }}
          >
            <Eye className="h-4 w-4" strokeWidth={1.8} />
            View receipt
          </Button>
        ) : (
          <span className="text-xs text-slate-400">No image</span>
        ),
    },
  ];

  const closePreview = () => {
    setPreviewOpen(false);
    setActiveRow(null);
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div className="space-y-4">
          <div className="relative w-full md:max-w-md">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search paid transactions..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <DataTable
            columns={columns}
            rows={error ? [] : pagedRows}
            keyField="id"
            loading={loading}
            compact
            striped={false}
            emptyMessage={
              error
                ? "Unable to load payment history."
                : "No paid payment transactions yet. Approved payments will appear here."
            }
            className="shadow-none"
          />

          {!loading && !error ? (
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <div className="text-xs text-slate-600">
                Showing <span className="font-medium">{filteredRows.length === 0 ? 0 : startIndex + 1}</span>-
                <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, filteredRows.length)}</span> of{" "}
                <span className="font-medium">{filteredRows.length}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canPrev) {
                      setCurrentPage((page) => page - 1);
                    }
                  }}
                  disabled={!canPrev}
                >
                  Previous
                </Button>

                <div className="text-xs text-slate-600">
                  Page <span className="font-medium">{currentPage}</span> of{" "}
                  <span className="font-medium">{totalPages}</span>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (canNext) {
                      setCurrentPage((page) => page + 1);
                    }
                  }}
                  disabled={!canNext}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        open={previewOpen}
        onClose={closePreview}
        title="Payment Receipt"
        description="Review the receipt saved for this paid transaction."
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closePreview}>
              Close
            </Button>
            {activeRow?.screenshotUrl ? (
              <a
                href={activeRow.screenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Open image
              </a>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          {activeRow?.screenshotUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
              <img
                src={activeRow.screenshotUrl}
                alt={`${activeRow.service || "Payment"} receipt`}
                className="max-h-[560px] w-full rounded-lg bg-white object-contain"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              No screenshot was found for this paid transaction.
            </div>
          )}

          {!activeRow?.screenshotUrl ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ImageIcon className="h-4 w-4" strokeWidth={1.8} />
              Screenshot preview unavailable.
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

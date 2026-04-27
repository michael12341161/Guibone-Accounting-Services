import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, ImageIcon, XCircle } from "lucide-react";
import { api, resolveBackendAssetUrl, updatePaymentStatus } from "../../services/api";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

const PAGE_SIZE = 10;

function normalizePaymentStatusLabel(status) {
  const raw = String(status || "").trim();
  return raw || "Pending";
}

function normalizePaymentStatusKey(status) {
  const value = normalizePaymentStatusLabel(status).toLowerCase();
  if (value === "rejected" || value === "declined") {
    return "reject";
  }
  return value;
}

function paymentStatusPillClass(status) {
  const value = normalizePaymentStatusKey(status);
  if (value === "paid") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (value === "processing") {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  if (value === "reject" || value === "rejected" || value === "declined") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function getAdminPaymentStatusSortRank(status) {
  const value = normalizePaymentStatusKey(status);
  if (value === "processing") {
    return 0;
  }
  if (value === "pending") {
    return 1;
  }
  if (value === "paid") {
    return 3;
  }
  return 2;
}

function formatDateLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
  }

  const parsed = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function isPaymentSubmissionRow(row) {
  return Boolean(
    row?.payment_exists ??
      row?.payment?.exists ??
      row?.payment_screenshot ??
      row?.payment?.screenshot
  );
}

function buildPaymentRow(row) {
  const appointmentId = row?.Appointment_ID ?? row?.appointment_id ?? row?.id ?? "";
  const payment = row?.payment && typeof row.payment === "object" ? row.payment : {};
  const screenshotPath = String(
    row?.payment_screenshot || payment?.screenshot || ""
  ).trim();
  const screenshotUrl = screenshotPath ? resolveBackendAssetUrl(screenshotPath) : "";
  const paymentStatus = normalizePaymentStatusLabel(
    row?.payment_status_name || row?.payment_status || payment?.status_name
  );

  return {
    id: payment?.id || `appointment-payment-${appointmentId}`,
    paymentId: payment?.id || null,
    appointmentId,
    client: row?.client_name || row?.Client_name || row?.client || "Unknown client",
    service: row?.service_name || row?.service || row?.Name || "Appointment",
    appointmentDate: row?.date || row?.Date || "",
    paymentDate: row?.payment_date || payment?.date || "",
    paymentMethod: row?.payment_method_name || payment?.payment_method_name || "-",
    paymentStatus,
    screenshotPath,
    screenshotUrl,
  };
}

export default function AdminClientPaymentPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [activePaymentRow, setActivePaymentRow] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [updatingPaymentId, setUpdatingPaymentId] = useState(null);
  useErrorToast(error);

  const loadClientPayments = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const response = await api.get("/appointment_list.php");
      const list = Array.isArray(response?.data?.appointments)
        ? response.data.appointments
        : Array.isArray(response?.data?.rows)
          ? response.data.rows
          : Array.isArray(response?.data)
            ? response.data
            : [];

      const nextRows = list
        .filter(isPaymentSubmissionRow)
        .map(buildPaymentRow);

      setRows(nextRows);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load client payment submissions."
      );
      setRows([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    void loadClientPayments({ silent: false });

    const intervalId = setInterval(() => {
      if (mounted) {
        void loadClientPayments({ silent: true });
      }
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    return rows
      .filter((row) => {
        const matchesStatus =
          statusFilter === "all" ||
          normalizePaymentStatusKey(row.paymentStatus) === statusFilter;
        if (!matchesStatus) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          String(row.client || "").toLowerCase().includes(query) ||
          String(row.service || "").toLowerCase().includes(query) ||
          String(row.paymentMethod || "").toLowerCase().includes(query) ||
          String(row.paymentStatus || "").toLowerCase().includes(query) ||
          String(row.appointmentDate || "").toLowerCase().includes(query) ||
          String(row.paymentDate || "").toLowerCase().includes(query)
        );
      })
      .slice()
      .sort((left, right) => {
        const rankDiff =
          getAdminPaymentStatusSortRank(left.paymentStatus) -
          getAdminPaymentStatusSortRank(right.paymentStatus);
        if (rankDiff !== 0) {
          return rankDiff;
        }

        const rightDate = String(right.paymentDate || right.appointmentDate || "");
        const leftDate = String(left.paymentDate || left.appointmentDate || "");
        return rightDate.localeCompare(leftDate) || String(right.id).localeCompare(String(left.id));
      });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const openPaymentScreenshot = (row) => {
    setActivePaymentRow(row);
    setPreviewOpen(true);
  };

  const closePaymentScreenshot = () => {
    setPreviewOpen(false);
    setActivePaymentRow(null);
  };

  const syncUpdatedPayment = (payment) => {
    if (!payment || typeof payment !== "object") {
      return;
    }

    const paymentId = payment?.id ?? null;
    const appointmentId = payment?.appointment_id ?? null;
    const nextStatus = normalizePaymentStatusLabel(payment?.status_name);
    const nextScreenshotPath = String(payment?.screenshot || "").trim();
    const nextScreenshotUrl = nextScreenshotPath ? resolveBackendAssetUrl(nextScreenshotPath) : "";

    const applyUpdate = (row) => {
      const matchesPaymentId = paymentId && row.paymentId && String(row.paymentId) === String(paymentId);
      const matchesAppointmentId = appointmentId && String(row.appointmentId) === String(appointmentId);
      if (!matchesPaymentId && !matchesAppointmentId) {
        return row;
      }

      return {
        ...row,
        id: paymentId || row.id,
        paymentId: paymentId || row.paymentId,
        paymentMethod: payment?.payment_method_name || row.paymentMethod,
        paymentStatus: nextStatus,
        paymentDate: payment?.date || row.paymentDate,
        screenshotPath: nextScreenshotPath || row.screenshotPath,
        screenshotUrl: nextScreenshotUrl || row.screenshotUrl,
      };
    };

    setRows((currentRows) => currentRows.map(applyUpdate));
    setActivePaymentRow((currentRow) => (currentRow ? applyUpdate(currentRow) : currentRow));
  };

  const handlePaymentStatusUpdate = async (row, status) => {
    if (!row?.paymentId) {
      setError("Payment record could not be resolved for this receipt.");
      return;
    }

    try {
      setUpdatingPaymentId(row.paymentId);
      setError("");

      const response = await updatePaymentStatus({
        payment_id: row.paymentId,
        status,
      });

      const nextPayment = response?.data?.payment || null;
      if (nextPayment) {
        syncUpdatedPayment(nextPayment);
      }

      showSuccessToast(response?.data?.message || "Payment status updated successfully.");
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to update the payment status."
      );
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const columns = [
    { key: "client", header: "Client", width: "18%" },
    { key: "service", header: "Service", width: "16%" },
    {
      key: "appointmentDate",
      header: "Appointment Date",
      width: "14%",
      render: (value) => formatDateLabel(value),
    },
    { key: "paymentMethod", header: "Method", width: "12%" },
    {
      key: "paymentStatus",
      header: "Payment Status",
      width: "12%",
      render: (value) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${paymentStatusPillClass(value)}`}>
          {normalizePaymentStatusLabel(value)}
        </span>
      ),
    },
    {
      key: "paymentDate",
      header: "Submitted",
      width: "12%",
      render: (value) => formatDateLabel(value),
    },
    {
      key: "review",
      header: "Review",
      width: "16%",
      render: (_, row) =>
        row.screenshotUrl ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => openPaymentScreenshot(row)}
          >
            <Eye className="h-4 w-4" strokeWidth={1.8} />
            Review payment
          </Button>
        ) : (
          <span className="text-xs text-slate-400">No screenshot</span>
        ),
    },
  ];

  const activePaymentStatusKey = normalizePaymentStatusKey(activePaymentRow?.paymentStatus);
  const isUpdatingActivePayment =
    Boolean(activePaymentRow?.paymentId) &&
    String(updatingPaymentId || "") === String(activePaymentRow?.paymentId || "");

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader>
          <CardTitle>Client Payments</CardTitle>
          <CardDescription>
            Receive and review the payment screenshots uploaded by clients.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search payments..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-48"
            >
              <option value="all">All statuses</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <DataTable
            columns={columns}
            rows={error ? [] : pagedRows}
            keyField="id"
            loading={loading}
            compact
            striped={false}
            emptyMessage={error ? "Unable to load client payments." : "No uploaded payment screenshots yet."}
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
                    if (canPrev) setCurrentPage((page) => page - 1);
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
                    if (canNext) setCurrentPage((page) => page + 1);
                  }}
                  disabled={!canNext}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Modal
        open={previewOpen}
        onClose={closePaymentScreenshot}
        title="Payment Screenshot"
        description="Review the receipt uploaded by the client."
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closePaymentScreenshot}>
              Close
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (activePaymentRow) {
                  void handlePaymentStatusUpdate(activePaymentRow, "Reject");
                }
              }}
              disabled={
                !activePaymentRow?.paymentId ||
                isUpdatingActivePayment ||
                activePaymentStatusKey === "reject" ||
                activePaymentStatusKey === "paid"
              }
            >
              <XCircle className="h-4 w-4" strokeWidth={1.8} />
              {isUpdatingActivePayment && activePaymentStatusKey !== "paid" ? "Updating..." : "Reject Payment"}
            </Button>
            <Button
              type="button"
              variant="success"
              onClick={() => {
                if (activePaymentRow) {
                  void handlePaymentStatusUpdate(activePaymentRow, "Paid");
                }
              }}
              disabled={!activePaymentRow?.paymentId || isUpdatingActivePayment || activePaymentStatusKey === "paid"}
            >
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
              {isUpdatingActivePayment && activePaymentStatusKey !== "reject" ? "Updating..." : "Mark as Paid"}
            </Button>
            {activePaymentRow?.screenshotUrl ? (
              <a
                href={activePaymentRow.screenshotUrl}
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
          {activePaymentRow?.screenshotUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
              <img
                src={activePaymentRow.screenshotUrl}
                alt={`${activePaymentRow.client || "Client"} payment receipt`}
                className="max-h-[560px] w-full rounded-lg bg-white object-contain"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              No screenshot was found for this payment submission.
            </div>
          )}

          {!activePaymentRow?.screenshotUrl ? (
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import PieChart from "../../components/charts/PieChart";
import Barchart from "../../components/charts/Barchart";
import { DataTable } from "../../components/UI/table";
import { api } from "../../services/api";
import { firstNonEmptyString, readBracketMetaValue } from "../../utils/descriptionMeta";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

const TASK_STATUS_COLORS = {
  Completed: "#10b981",
  "In Progress": "#0ea5e9",
  "Not Started": "#f59e0b",
  Incomplete: "#f97316",
  Overdue: "#f43f5e",
  Declined: "#f43f5e",
  Other: "#94a3b8",
};

const APPOINTMENT_STATUS_COLORS = {
  Approved: "#10b981",
  Pending: "#f59e0b",
  Declined: "#f43f5e",
  Completed: "#0ea5e9",
  Other: "#94a3b8",
};

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const REPORT_VIEWS = [
  { value: "works", label: "Total Works" },
  { value: "appointments", label: "Total Appointment" },
  { value: "consultations", label: "Total Consultation" },
  { value: "workload", label: "Accountant Workload" },
];

const EXPORT_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel (.xlsx)" },
  { value: "pdf", label: "PDF" },
];

const CHART_PALETTE = [
  "#0f766e",
  "#0ea5e9",
  "#6366f1",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
  "#22c55e",
  "#64748b",
];

const PAGE_SIZE = 10;

function parseDateValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const parsed = value instanceof Date ? value : parseDateValue(value);
  if (!parsed) return "-";

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const match = raw.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : raw;
}

function startOfDay(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function getRangeStart(range) {
  if (range === "all") return null;

  const today = startOfDay(new Date());
  const next = new Date(today);
  if (range === "7d") {
    next.setDate(next.getDate() - 7);
    return next;
  }
  if (range === "90d") {
    next.setDate(next.getDate() - 90);
    return next;
  }

  next.setDate(next.getDate() - 30);
  return next;
}

function matchesRange(value, range) {
  if (range === "all") return true;
  const parsed = parseDateValue(value);
  const rangeStart = getRangeStart(range);
  if (!parsed || !rangeStart) return false;
  return parsed >= rangeStart;
}

function normalizeTaskStatus(statusRaw) {
  const status = String(statusRaw || "").trim().toLowerCase();

  if (status === "completed" || status === "done") return "Completed";
  if (status === "in progress" || status === "started") return "In Progress";
  if (status === "incomplete") return "Incomplete";
  if (status === "overdue") return "Overdue";
  if (status === "declined" || status === "cancelled" || status === "canceled") return "Declined";
  if (status === "not started" || status === "pending" || status === "") return "Not Started";

  return statusRaw ? String(statusRaw) : "Other";
}

function normalizeAppointmentStatus(statusRaw) {
  const status = String(statusRaw || "").trim().toLowerCase();

  if (status === "approved" || status === "active" || status === "in progress" || status === "confirmed") {
    return "Approved";
  }
  if (status === "reject" || status === "rejected" || status === "declined" || status === "cancelled") return "Declined";
  if (status === "completed" || status === "done") return "Completed";
  if (status === "pending" || status === "") return "Pending";

  return statusRaw ? String(statusRaw) : "Other";
}

function isTaskClosed(task) {
  return normalizeTaskStatus(task?.status) === "Completed";
}

function safeFilenamePart(value) {
  return String(value || "report")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 72);
}

function csvEscape(value) {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportRowsToCsv(filename, columnDefs, rows) {
  const header = columnDefs.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((row) => columnDefs.map((c) => csvEscape(row[c.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

function exportRowsToExcel(filename, columnDefs, rows) {
  const workbook = XLSX.utils.book_new();
  let worksheet;
  if (!rows.length) {
    worksheet = XLSX.utils.aoa_to_sheet([columnDefs.map((c) => c.header)]);
  } else {
    const sheetData = rows.map((row) =>
      Object.fromEntries(columnDefs.map((c) => [c.header, row[c.key] ?? ""]))
    );
    worksheet = XLSX.utils.json_to_sheet(sheetData);
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  XLSX.writeFile(workbook, filename);
}

function exportRowsToPdf(filename, title, columnDefs, rows) {
  const doc = new jsPDF({
    orientation: columnDefs.length > 5 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const keys = columnDefs.map((c) => c.key);
  const headers = columnDefs.map((c) => c.header);
  const colCount = Math.max(headers.length, 1);
  const usable = pageWidth - margin * 2;
  const colW = usable / colCount;
  const lineHeight = 13;
  const cellPad = 4;

  let y = margin;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(String(title).slice(0, 120), margin, y);
  y += lineHeight * 1.6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  headers.forEach((h, i) => {
    doc.text(String(h).slice(0, 28), margin + i * colW + cellPad, y);
  });
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  rows.forEach((row) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    keys.forEach((k, i) => {
      const text = String(row[k] ?? "").slice(0, 36);
      doc.text(text, margin + i * colW + cellPad, y);
    });
    y += lineHeight;
  });

  doc.save(filename);
}

export default function SecretaryReports() {
  const [range, setRange] = useState("30d");
  const [reportView, setReportView] = useState("works");
  const [exportFormat, setExportFormat] = useState("csv");
  const [tasks, setTasks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useErrorToast(error);

  const loadReports = useCallback(async ({ silent } = { silent: false }) => {
    try {
      setError("");

      const [tasksRes, appointmentsRes, schedulingRes] = await Promise.all([
        api.get("task_list.php"),
        api.get("appointment_list.php"),
        api.get("scheduling_list.php").catch(() => null),
      ]);

      setTasks(Array.isArray(tasksRes?.data?.tasks) ? tasksRes.data.tasks : []);
      setAppointments(Array.isArray(appointmentsRes?.data?.appointments) ? appointmentsRes.data.appointments : []);
      const schedulingList = schedulingRes?.data?.rows ?? schedulingRes?.data?.scheduling ?? schedulingRes?.data ?? [];
      setConsultations(Array.isArray(schedulingList) ? schedulingList : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load secretary reports.");
      if (!silent) {
        setTasks([]);
        setAppointments([]);
        setConsultations([]);
      }
    }
  }, []);

  useEffect(() => {
    void loadReports({ silent: false });

    const intervalId = window.setInterval(() => {
      void loadReports({ silent: true });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadReports]);

  const filteredTasks = useMemo(() => {
    return (Array.isArray(tasks) ? tasks : []).filter((task) =>
      matchesRange(task?.due_date || task?.deadline || task?.created_at || task?.createdAt, range)
    );
  }, [range, tasks]);

  const filteredAppointments = useMemo(() => {
    return (Array.isArray(appointments) ? appointments : []).filter((appointment) =>
      matchesRange(appointment?.date || appointment?.Date, range)
    );
  }, [appointments, range]);

  const filteredConsultations = useMemo(() => {
    return (Array.isArray(consultations) ? consultations : []).filter((row) => {
      const dateRaw = row?.Date ?? row?.date ?? "";
      const dateStr = dateRaw ? String(dateRaw).slice(0, 10) : "";
      return matchesRange(dateStr, range);
    });
  }, [consultations, range]);

  const openTasks = useMemo(
    () => filteredTasks.filter((task) => !isTaskClosed(task)),
    [filteredTasks]
  );

  const taskStatusBreakdown = useMemo(() => {
    const counts = {
      Completed: 0,
      "In Progress": 0,
      "Not Started": 0,
      Incomplete: 0,
      Overdue: 0,
      Declined: 0,
      Other: 0,
    };

    filteredTasks.forEach((task) => {
      const label = normalizeTaskStatus(task?.status);
      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredTasks]);

  const appointmentStatusBreakdown = useMemo(() => {
    const counts = { Approved: 0, Pending: 0, Declined: 0, Completed: 0, Other: 0 };

    filteredAppointments.forEach((appointment) => {
      const label = normalizeAppointmentStatus(appointment?.status);
      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredAppointments]);

  const consultationStatusBreakdown = useMemo(() => {
    const counts = { Approved: 0, Pending: 0, Declined: 0, Completed: 0, Other: 0 };

    filteredConsultations.forEach((row) => {
      const statusRaw = row?.Status ?? row?.status ?? row?.Status_name ?? row?.status_name ?? "";
      const label = normalizeAppointmentStatus(statusRaw);
      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredConsultations]);

  const accountantWorkload = useMemo(() => {
    const counts = new Map();
    openTasks.forEach((task) => {
      const assignee = String(task?.accountant_name || "").trim() || `Accountant #${task?.accountant_id || "?"}`;
      counts.set(assignee, (counts.get(assignee) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 12);
  }, [openTasks]);

  const workloadColors = useMemo(() => {
    const colors = {};
    accountantWorkload.forEach((item, index) => {
      colors[item.name] = CHART_PALETTE[index % CHART_PALETTE.length];
    });
    colors.Other = "#94a3b8";
    return colors;
  }, [accountantWorkload]);

  const reportTable = useMemo(() => {
    if (reportView === "works") {
      const columns = [
        { key: "task", header: "Task" },
        { key: "client", header: "Client" },
        { key: "service", header: "Service" },
        { key: "status", header: "Status" },
        { key: "due", header: "Due Date" },
        { key: "assignee", header: "Assigned To" },
      ];
      const rows = filteredTasks.map((task, idx) => ({
        id: String(task?.id ?? task?.task_id ?? `w-${idx}`),
        task: task?.title || task?.name || "—",
        client: task?.client_name || "—",
        service: task?.service_name || task?.service || "—",
        status: normalizeTaskStatus(task?.status),
        due: formatDate(task?.due_date || task?.deadline),
        assignee: task?.accountant_name || "Unassigned",
      }));
      return {
        title: "Total Works",
        description: "Task status mix and task list in the selected report window.",
        columns,
        rows,
        emptyMessage: "No task records in the selected range.",
      };
    }

    if (reportView === "appointments") {
      const columns = [
        { key: "client", header: "Client" },
        { key: "service", header: "Service" },
        { key: "date", header: "Date" },
        { key: "status", header: "Status" },
        { key: "notes", header: "Notes" },
      ];
      const rows = filteredAppointments.map((a, idx) => ({
        id: String(a?.id ?? a?.appointment_id ?? `a-${idx}`),
        client: a?.client_name || a?.Client_name || "—",
        service: a?.service_name || a?.service || a?.Name || "—",
        date: formatDate(a?.date || a?.Date),
        status: normalizeAppointmentStatus(a?.status),
        notes: String(a?.notes || a?.description || "").slice(0, 200) || "—",
      }));
      return {
        title: "Total Appointment",
        description: "Appointment status mix and appointment list in the selected window.",
        columns,
        rows: rows.map((currentRow, idx) => {
          const record = filteredAppointments[idx] ?? {};
          const description = String(record?.Description ?? record?.description ?? "");
          const service = firstNonEmptyString(
            record?.service_name,
            record?.service,
            readBracketMetaValue(description, "Service"),
            record?.Name
          );
          const notes = firstNonEmptyString(record?.notes, record?.Notes, readBracketMetaValue(description, "Notes"));

          return {
            ...currentRow,
            client: record?.client_name || record?.Client_name || "-",
            service: service || "-",
            notes: notes ? notes.slice(0, 200) : "-",
          };
        }),
        emptyMessage: "No appointment activity in the selected range.",
      };
    }

    if (reportView === "consultations") {
      const columns = [
        { key: "client", header: "Client" },
        { key: "title", header: "Title / Service" },
        { key: "date", header: "Date" },
        { key: "time", header: "Time" },
        { key: "status", header: "Status" },
      ];
      const rows = filteredConsultations.map((row, idx) => {
        const dateRaw = row?.Date ?? row?.date ?? "";
        const dateStr = dateRaw ? String(dateRaw).slice(0, 10) : "";
        const timeRaw = row?.Time ?? row?.time ?? "";
        const timeStr = timeRaw ? String(timeRaw).slice(0, 8) : "—";
        const statusRaw = row?.Status ?? row?.status ?? "";
        return {
          id: String(row?.Scheduling_ID ?? row?.scheduling_id ?? row?.id ?? `c-${idx}`),
          client: row?.Client_name ?? row?.client_name ?? "—",
          title: row?.Name ?? row?.title ?? row?.Title ?? "Consultation",
          date: dateStr ? formatDate(dateStr) : "—",
          time: timeStr,
          status: normalizeAppointmentStatus(statusRaw),
        };
      });
      return {
        title: "Total Consultation",
        description: "Consultation status mix and scheduling list in the selected window.",
        columns,
        rows: rows.map((currentRow, idx) => {
          const record = filteredConsultations[idx] ?? {};
          const description = String(record?.Description ?? record?.description ?? "");
          const dateRaw = record?.Date ?? record?.date ?? "";
          const dateStr = dateRaw ? String(dateRaw).slice(0, 10) : "";
          const timeRaw = firstNonEmptyString(record?.Time, record?.time, readBracketMetaValue(description, "Time"));
          const title = firstNonEmptyString(
            record?.Consultation_Service,
            record?.consultation_service,
            record?.service_name,
            record?.service,
            readBracketMetaValue(description, "Service"),
            record?.Name,
            record?.title,
            record?.Title,
            readBracketMetaValue(description, "Type")
          );

          return {
            ...currentRow,
            client: record?.Client_name ?? record?.client_name ?? "-",
            title: title || "Consultation",
            date: dateStr ? formatDate(dateStr) : "-",
            time: formatTime(timeRaw),
          };
        }),
        emptyMessage: "No consultation records in the selected range.",
      };
    }

    const columns = [
      { key: "task", header: "Task" },
      { key: "client", header: "Client" },
      { key: "assignee", header: "Assigned To" },
      { key: "status", header: "Status" },
      { key: "due", header: "Due Date" },
      { key: "service", header: "Service" },
    ];
    const sortedOpen = [...openTasks].sort((a, b) => {
      const na = String(a?.accountant_name || "").localeCompare(String(b?.accountant_name || ""));
      if (na !== 0) return na;
      return String(a?.title || a?.name || "").localeCompare(String(b?.title || b?.name || ""));
    });
    const rows = sortedOpen.map((task, idx) => ({
      id: String(task?.id ?? task?.task_id ?? `o-${idx}`),
      task: task?.title || task?.name || "—",
      client: task?.client_name || "—",
      assignee: task?.accountant_name || "Unassigned",
      status: normalizeTaskStatus(task?.status),
      due: formatDate(task?.due_date || task?.deadline),
      service: task?.service_name || task?.service || "—",
    }));
    return {
      title: "Accountant Workload",
      description: "Open tasks per accountant (chart) and open-task list for the selected window.",
      columns,
      rows,
      emptyMessage: "No open tasks in the selected range.",
    };
  }, [reportView, filteredTasks, filteredAppointments, filteredConsultations, openTasks]);

  const reportRowCount = reportTable.rows.length;
  const totalPages = Math.max(1, Math.ceil(reportRowCount / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [reportView, range]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedReportRows = reportTable.rows.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const chartConfig = useMemo(() => {
    if (reportView === "works") {
      return {
        kind: "pie",
        data: taskStatusBreakdown,
        colors: TASK_STATUS_COLORS,
        emptyLabel: "No task records in the selected range.",
      };
    }
    if (reportView === "appointments") {
      return {
        kind: "pie",
        data: appointmentStatusBreakdown,
        colors: APPOINTMENT_STATUS_COLORS,
        emptyLabel: "No appointment activity in the selected range.",
      };
    }
    if (reportView === "consultations") {
      return {
        kind: "pie",
        data: consultationStatusBreakdown,
        colors: APPOINTMENT_STATUS_COLORS,
        emptyLabel: "No consultation records in the selected range.",
      };
    }
    return {
      kind: "bar",
      data: accountantWorkload,
      colors: workloadColors,
      emptyLabel: "No active accountant workload found.",
    };
  }, [
    reportView,
    taskStatusBreakdown,
    appointmentStatusBreakdown,
    consultationStatusBreakdown,
    accountantWorkload,
    workloadColors,
  ]);

  const rangeLabel = useMemo(() => RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range, [range]);

  const handleExport = useCallback(() => {
    const viewSlug = safeFilenamePart(REPORT_VIEWS.find((v) => v.value === reportView)?.label ?? "report");
    const rangeSlug = safeFilenamePart(rangeLabel);
    const base = `secretary-${viewSlug}-${rangeSlug}`;

    const docTitle = `${reportTable.title} — ${rangeLabel}`;

    if (exportFormat === "csv") {
      const filename = `${base}.csv`;
      exportRowsToCsv(filename, reportTable.columns, reportTable.rows);
      showSuccessToast(`Download started: ${filename}`);
      return;
    }
    if (exportFormat === "excel") {
      const filename = `${base}.xlsx`;
      exportRowsToExcel(filename, reportTable.columns, reportTable.rows);
      showSuccessToast(`Download started: ${filename}`);
      return;
    }
    const filename = `${base}.pdf`;
    exportRowsToPdf(filename, docTitle, reportTable.columns, reportTable.rows);
    showSuccessToast(`Download started: ${filename}`);
  }, [exportFormat, rangeLabel, reportTable, reportView]);

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>
            Track appointments, task deadlines, and accountant workload from the secretary dashboard.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="flex min-w-0 flex-col gap-1 sm:w-40">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500" htmlFor="report-range">
                Date range
              </label>
              <select
                id="report-range"
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:min-w-[12rem] sm:max-w-xs">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500" htmlFor="report-view">
                Report
              </label>
              <select
                id="report-view"
                value={reportView}
                onChange={(e) => setReportView(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {REPORT_VIEWS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1 sm:w-44">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500" htmlFor="export-format">
                Export as
              </label>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="success" size="sm" className="w-full sm:mb-0.5 sm:w-auto" onClick={handleExport} type="button">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          <Card compact className="shadow-none">
            <CardHeader>
              <CardTitle>{reportTable.title}</CardTitle>
              <CardDescription>{reportTable.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {chartConfig.kind === "pie" ? (
                <PieChart data={chartConfig.data} colors={chartConfig.colors} emptyLabel={chartConfig.emptyLabel} />
              ) : (
                <Barchart
                  data={chartConfig.data}
                  colors={chartConfig.colors}
                  barSize={34}
                  emptyLabel={chartConfig.emptyLabel}
                />
              )}
            </CardContent>
          </Card>

          <Card compact className="shadow-none">
            <CardHeader>
              <CardTitle>List</CardTitle>
              <CardDescription>
                {reportTable.rows.length} row{reportTable.rows.length === 1 ? "" : "s"} · {rangeLabel}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <DataTable
                columns={reportTable.columns}
                rows={pagedReportRows}
                keyField="id"
                compact
                striped={false}
                emptyMessage={reportTable.emptyMessage}
                className="shadow-none"
              />
              <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
                <div className="text-xs text-slate-600">
                  Showing <span className="font-medium">{reportRowCount === 0 ? 0 : startIndex + 1}</span>-
                  <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, reportRowCount)}</span> of{" "}
                  <span className="font-medium">{reportRowCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      if (canPrev) setCurrentPage((prev) => prev - 1);
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
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => {
                      if (canNext) setCurrentPage((prev) => prev + 1);
                    }}
                    disabled={!canNext}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

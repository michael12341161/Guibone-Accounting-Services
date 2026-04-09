import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import PieChart from "../../components/charts/PieChart";
import Barchart from "../../components/charts/Barchart";
import { DataTable } from "../../components/UI/table";
import { api } from "../../services/api";
import { useErrorToast } from "../../utils/feedback";

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

const DUE_WINDOW_COLORS = {
  Overdue: "#f43f5e",
  "Due Today": "#f59e0b",
  "This Week": "#0ea5e9",
  Other: "#94a3b8",
};

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
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

function extractMetaFromDescription(descriptionRaw) {
  const description = String(descriptionRaw || "");
  const getValue = (key) => {
    const match = description.match(new RegExp(`^\\s*\\[${key}\\]\\s*(.+?)\\s*$`, "im"));
    return match?.[1]?.trim() || "";
  };

  return {
    priority: getValue("Priority"),
    deadline: getValue("Deadline"),
  };
}

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

function formatDateTime(value) {
  const parsed = value instanceof Date ? value : parseDateValue(value);
  if (!parsed) return "-";

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
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

  if (status === "approved" || status === "active" || status === "in progress") return "Approved";
  if (status === "reject" || status === "rejected" || status === "declined" || status === "cancelled") return "Declined";
  if (status === "completed" || status === "done") return "Completed";
  if (status === "pending" || status === "") return "Pending";

  return statusRaw ? String(statusRaw) : "Other";
}

function isTaskClosed(task) {
  return normalizeTaskStatus(task?.status) === "Completed";
}

function getTaskPriority(task) {
  const meta = extractMetaFromDescription(task?.description);
  const priority = String(task?.priority || task?.task_priority || task?.level || meta.priority || "Low")
    .trim()
    .toLowerCase();

  if (priority === "high" || priority === "urgent") return "High";
  if (priority === "medium" || priority === "normal") return "Medium";
  return "Low";
}

function getPriorityClass(priority) {
  if (priority === "High") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "Medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getStatusClass(status) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "In Progress") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "Incomplete") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "Declined") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function csvEscape(value) {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SecretaryReports() {
  const [range, setRange] = useState("30d");
  const [tasks, setTasks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  useErrorToast(error);

  const loadReports = useCallback(async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const [tasksRes, appointmentsRes, usersRes, clientsRes] = await Promise.all([
        api.get("task_list.php"),
        api.get("appointment_list.php"),
        api.get("user_list.php"),
        api.get("client_list.php", { params: { exclude_unapproved_self_signup: 1 } }).catch(() => null),
      ]);

      setTasks(Array.isArray(tasksRes?.data?.tasks) ? tasksRes.data.tasks : []);
      setAppointments(Array.isArray(appointmentsRes?.data?.appointments) ? appointmentsRes.data.appointments : []);
      setUsers(Array.isArray(usersRes?.data?.users) ? usersRes.data.users : []);
      setClients(Array.isArray(clientsRes?.data?.clients) ? clientsRes.data.clients : []);
      setLastUpdated(new Date().toISOString());
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load secretary reports.");
      if (!silent) {
        setTasks([]);
        setAppointments([]);
        setUsers([]);
        setClients([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      setRefreshing(false);
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

  const openTasks = useMemo(
    () => filteredTasks.filter((task) => !isTaskClosed(task)),
    [filteredTasks]
  );

  const pendingAppointments = useMemo(
    () => filteredAppointments.filter((appointment) => normalizeAppointmentStatus(appointment?.status) === "Pending"),
    [filteredAppointments]
  );

  const activeAccountants = useMemo(() => {
    return (Array.isArray(users) ? users : []).filter((user) =>
      String(user?.role || "").trim().toLowerCase().includes("accountant")
    );
  }, [users]);

  const dueMetrics = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let overdue = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    openTasks.forEach((task) => {
      const dueDate = parseDateValue(task?.due_date || task?.deadline);
      if (!dueDate) return;

      if (dueDate < today) {
        overdue += 1;
      }
      if (dueDate >= today && dueDate < tomorrow) {
        dueToday += 1;
      }
      if (dueDate >= today && dueDate < weekEnd) {
        dueThisWeek += 1;
      }
    });

    return { overdue, dueToday, dueThisWeek };
  }, [openTasks]);

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

  const serviceDemand = useMemo(() => {
    const counts = new Map();
    filteredAppointments.forEach((appointment) => {
      const name = String(appointment?.service_name || appointment?.service || "Other").trim() || "Other";
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    if (counts.size === 0) {
      filteredTasks.forEach((task) => {
        const name = String(task?.service_name || task?.service || "Other").trim() || "Other";
        counts.set(name, (counts.get(name) || 0) + 1);
      });
    }

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [filteredAppointments, filteredTasks]);

  const accountantWorkload = useMemo(() => {
    const counts = new Map();
    openTasks.forEach((task) => {
      const assignee = String(task?.accountant_name || "").trim() || `Accountant #${task?.accountant_id || "?"}`;
      counts.set(assignee, (counts.get(assignee) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 8);
  }, [openTasks]);

  const dueWindowBreakdown = useMemo(() => {
    return [
      { name: "Overdue", value: dueMetrics.overdue },
      { name: "Due Today", value: dueMetrics.dueToday },
      { name: "This Week", value: dueMetrics.dueThisWeek },
    ];
  }, [dueMetrics]);

  const serviceColors = useMemo(() => {
    const colors = {};
    serviceDemand.forEach((item, index) => {
      colors[item.name] = CHART_PALETTE[index % CHART_PALETTE.length];
    });
    colors.Other = "#94a3b8";
    return colors;
  }, [serviceDemand]);

  const workloadColors = useMemo(() => {
    const colors = {};
    accountantWorkload.forEach((item, index) => {
      colors[item.name] = CHART_PALETTE[index % CHART_PALETTE.length];
    });
    colors.Other = "#94a3b8";
    return colors;
  }, [accountantWorkload]);

  const focusRows = useMemo(() => {
    const today = startOfDay(new Date());
    const priorityOrder = { High: 0, Medium: 1, Low: 2 };

    return openTasks
      .map((task) => {
        const priority = getTaskPriority(task);
        const dueDate = parseDateValue(task?.due_date || task?.deadline);
        const status = normalizeTaskStatus(task?.status);

        return {
          id: task?.id || task?.task_id || `${task?.client_id || "task"}-${task?.name || "item"}`,
          task: task?.title || task?.name || "Untitled task",
          client: task?.client_name || "Client",
          service: task?.service_name || task?.service || "Service",
          assignee: task?.accountant_name || "Unassigned",
          status,
          dueDate,
          dueDateLabel: formatDate(dueDate),
          priority,
          isOverdue: Boolean(dueDate && dueDate < today),
          dueTime: dueDate ? dueDate.getTime() : Number.POSITIVE_INFINITY,
          priorityRank: priorityOrder[priority] ?? 3,
        };
      })
      .sort((left, right) => {
        if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
        if (left.dueTime !== right.dueTime) return left.dueTime - right.dueTime;
        if (left.priorityRank !== right.priorityRank) return left.priorityRank - right.priorityRank;
        return left.task.localeCompare(right.task);
      });
  }, [openTasks]);

  const queueColumns = useMemo(
    () => [
      {
        key: "task",
        header: "Task",
        render: (value, row) => (
          <div className="min-w-0">
            <div className="font-medium text-slate-900">{value}</div>
            <div className="text-xs text-slate-500">{row.service}</div>
          </div>
        ),
      },
      { key: "client", header: "Client" },
      { key: "assignee", header: "Assigned To" },
      {
        key: "status",
        header: "Status",
        render: (value) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(value)}`}>
            {value}
          </span>
        ),
      },
      {
        key: "priority",
        header: "Priority",
        render: (value) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getPriorityClass(value)}`}>
            {value}
          </span>
        ),
      },
      {
        key: "dueDateLabel",
        header: "Due Date",
        render: (value, row) => (
          <span className={row.isOverdue ? "font-medium text-rose-700" : "text-slate-700"}>{value}</span>
        ),
      },
    ],
    []
  );

  const exportQueueReport = useCallback(() => {
    const exportRows = focusRows.map((row) => ({
      task: row.task,
      client: row.client,
      service: row.service,
      assignee: row.assignee,
      status: row.status,
      priority: row.priority,
      due_date: row.dueDateLabel,
    }));

    downloadCsv(
      "secretary-operational-report.csv",
      [
        { key: "task", label: "Task" },
        { key: "client", label: "Client" },
        { key: "service", label: "Service" },
        { key: "assignee", label: "Assigned To" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
        { key: "due_date", label: "Due Date" },
      ],
      exportRows
    );
  }, [focusRows]);

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader
          action={(
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={range}
                onChange={(event) => setRange(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 sm:w-36"
              >
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <Button variant="secondary" size="sm" onClick={() => void loadReports({ silent: true })} disabled={refreshing}>
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              <Button variant="success" size="sm" onClick={exportQueueReport} disabled={focusRows.length === 0}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          )}
        >
          <CardTitle>Reports</CardTitle>
          <CardDescription>
            Track appointments, task deadlines, and accountant workload from the secretary dashboard.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Active accountants: <span className="font-medium text-slate-700">{activeAccountants.length}</span>
              {" · "}
              Clients: <span className="font-medium text-slate-700">{clients.length}</span>
            </span>
            <span>Last updated: {lastUpdated ? formatDateTime(lastUpdated) : "-"}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Open Tasks</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{openTasks.length}</div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Overdue Tasks</div>
              <div className="mt-1 text-2xl font-bold text-rose-700">{dueMetrics.overdue}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Pending Appointments</div>
              <div className="mt-1 text-2xl font-bold text-amber-700">{pendingAppointments.length}</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Due Today</div>
              <div className="mt-1 text-2xl font-bold text-sky-700">{dueMetrics.dueToday}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Task Status Breakdown</CardTitle>
                <CardDescription>Current work mix in the selected report window.</CardDescription>
              </CardHeader>
              <CardContent>
                <PieChart
                  data={taskStatusBreakdown}
                  colors={TASK_STATUS_COLORS}
                  emptyLabel="No task records in the selected range."
                />
              </CardContent>
            </Card>

            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Appointment Status Breakdown</CardTitle>
                <CardDescription>Shows incoming appointment activity that needs coordination.</CardDescription>
              </CardHeader>
              <CardContent>
                <PieChart
                  data={appointmentStatusBreakdown}
                  colors={APPOINTMENT_STATUS_COLORS}
                  emptyLabel="No appointment activity in the selected range."
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Service Demand</CardTitle>
                <CardDescription>Most requested services from the selected operational window.</CardDescription>
              </CardHeader>
              <CardContent>
                <Barchart
                  data={serviceDemand}
                  colors={serviceColors}
                  barSize={34}
                  emptyLabel="No services were recorded in the selected range."
                />
              </CardContent>
            </Card>

            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Accountant Workload</CardTitle>
                <CardDescription>Open tasks currently assigned to each accountant.</CardDescription>
              </CardHeader>
              <CardContent>
                <Barchart
                  data={accountantWorkload}
                  colors={workloadColors}
                  barSize={34}
                  emptyLabel="No active accountant workload found."
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Deadline Windows</CardTitle>
                <CardDescription>Quick view of which task deadlines need attention first.</CardDescription>
              </CardHeader>
              <CardContent>
                <Barchart
                  data={dueWindowBreakdown}
                  colors={DUE_WINDOW_COLORS}
                  barSize={44}
                  emptyLabel="No task deadlines available."
                />
              </CardContent>
            </Card>

            <Card compact className="shadow-none">
              <CardHeader>
                <CardTitle>Operational Summary</CardTitle>
                <CardDescription>High-signal figures for secretarial follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Appointments In Window</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{filteredAppointments.length}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Completed Tasks</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {filteredTasks.filter((task) => isTaskClosed(task)).length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Workload Per Accountant</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {activeAccountants.length > 0 ? (openTasks.length / activeAccountants.length).toFixed(1) : "0.0"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Due This Week</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{dueMetrics.dueThisWeek}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card compact className="shadow-none">
            <CardHeader>
              <CardTitle>Operational Queue</CardTitle>
              <CardDescription>
                Tasks that still need coordination, ranked by urgency, due date, and priority.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={queueColumns}
                rows={focusRows}
                keyField="id"
                loading={loading}
                compact
                striped={false}
                emptyMessage="No active tasks in the selected range."
                className="shadow-none"
              />
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

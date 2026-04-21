import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../UI/card";
import { DataTable } from "../UI/table";
import { Button } from "../UI/buttons";
import { joinPersonName } from "../../utils/person_name";
import { getClientId } from "../../utils/client_identity";

function readMetaLine(text, key) {
  const source = String(text || "");
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*([^\\r\\n]*)\\s*$`, "im");
  const match = source.match(re);
  return match ? String(match[1] || "").trim() : "";
}

function normalizeAppointmentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Pending";
  if (["approved", "active", "in progress", "started"].includes(normalized)) {
    return "Approved";
  }
  if (["rejected", "reject", "declined", "cancelled", "canceled"].includes(normalized)) {
    return "Declined";
  }
  if (["completed", "done"].includes(normalized)) {
    return "Completed";
  }
  return String(value || "").trim();
}

function normalizeApprovedByLabel(value) {
  const display = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!display) return "";
  const tokens = display.split(" ");
  if (tokens.length > 1 && new Set(tokens.map((token) => token.toLowerCase())).size === 1) {
    return tokens[0];
  }
  return display;
}

function isApprovedAppointmentStatus(value) {
  return normalizeAppointmentStatus(value).toLowerCase() === "approved";
}

function getClientDisplayName(client) {
  const fullName = joinPersonName([client?.first_name, client?.middle_name, client?.last_name]);
  const clientId = getClientId(client);
  return fullName || client?.email || (clientId ? `Client #${clientId}` : "");
}

function formatAppointmentDate(raw) {
  const value = String(raw || "").trim();
  if (!value) return "-";

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeServiceMatchKey(value) {
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (!compact) return "";
  if (compact === "booking" || compact.includes("bookkeep")) return "bookkeeping";
  if (compact.includes("taxfil")) return "taxfiling";
  if (compact.includes("audit")) return "auditing";
  if (compact.includes("taxcomp")) return "taxcomputation";
  return compact;
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toISOString().slice(0, 10);
}

function getTaskAppointmentId(task) {
  const description = String(task?.description || "");
  const directValue = String(
    task?.appointment_id ?? task?.Appointment_ID ?? readMetaLine(description, "Appointment_ID") ?? ""
  ).trim();
  return directValue;
}

function getTaskDeadline(task) {
  return String(
    task?.deadline ?? task?.due_date ?? task?.date ?? readMetaLine(task?.description, "Deadline") ?? ""
  ).trim();
}

function buildAppointmentMatchKey(clientId, serviceName, dateValue) {
  const normalizedClientId = String(clientId || "").trim();
  const normalizedService = normalizeServiceMatchKey(serviceName);
  const normalizedDate = normalizeDateKey(dateValue);

  if (!normalizedClientId || !normalizedService || !normalizedDate) {
    return "";
  }

  return [normalizedClientId, normalizedService, normalizedDate].join("|");
}

function getClientSecondaryLabel(client, row) {
  const fromClient = String(client?.business_trade_name || client?.email || "").trim();
  if (fromClient) return fromClient;
  return String(row?.client_email || row?.client_username || "").trim();
}

function compareAppointments(left, right) {
  const leftTime = Date.parse(`${String(left?.date || "").slice(0, 10)}T00:00:00`);
  const rightTime = Date.parse(`${String(right?.date || "").slice(0, 10)}T00:00:00`);
  const safeLeftTime = Number.isNaN(leftTime) ? 0 : leftTime;
  const safeRightTime = Number.isNaN(rightTime) ? 0 : rightTime;

  if (safeRightTime !== safeLeftTime) {
    return safeRightTime - safeLeftTime;
  }

  const leftId = Number(left?.id || 0);
  const rightId = Number(right?.id || 0);
  return rightId - leftId;
}

function statusPillClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "completed") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (normalized === "declined") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizeAppointmentRow(row, activeClientsById, appointmentIdsWithTasks, appointmentFallbackKeysWithTasks) {
  const desc = String(row?.Description ?? row?.description ?? "");
  const id = String(row?.id ?? row?.appointment_id ?? row?.Appointment_ID ?? "").trim();
  const clientId = getClientId(row);
  const activeClient = clientId ? activeClientsById.get(clientId) : null;
  const serviceName = String(
    row?.service_name ||
      row?.service ||
      row?.Service_name ||
      row?.Services ||
      row?.Name ||
      readMetaLine(desc, "Service")
  ).trim();
  const status = normalizeAppointmentStatus(
    row?.status || row?.Status || row?.appointment_status || row?.Status_name
  );
  const approvedBy = String(
    row?.action_by_name ||
      row?.action_by_username ||
      (Number(row?.action_by ?? row?.Action_by ?? 0) > 0
        ? `User #${row?.action_by ?? row?.Action_by}`
        : "")
  ).trim();
  const clientName = String(
    row?.client_name || row?.Client_name || getClientDisplayName(activeClient) || ""
  ).trim();
  const secondary = getClientSecondaryLabel(activeClient, row);
  const date = String(row?.date || row?.Date || row?.appointment_date || "").trim();
  const serviceId = String(row?.service_id ?? row?.Services_type_Id ?? "").trim();
  const matchKey = buildAppointmentMatchKey(clientId, serviceName, date);

  return {
    id,
    clientId,
    clientName: clientName || (clientId ? `Client #${clientId}` : "Unknown client"),
    secondary,
    serviceId,
    serviceName,
    date,
    approvedBy: normalizeApprovedByLabel(approvedBy),
    status,
    hasTask:
      (id && appointmentIdsWithTasks.has(String(id))) ||
      (matchKey && appointmentFallbackKeysWithTasks.has(matchKey)),
    description: desc,
  };
}

export default function ApprovedAppointmentsCard({
  appointments,
  tasks,
  activeClients,
  selectedAppointmentId,
  onSelect,
}) {
  const [search, setSearch] = useState("");
  const approvedAppointments = useMemo(() => {
    const activeClientsById = new Map(
      (Array.isArray(activeClients) ? activeClients : [])
        .map((client) => [getClientId(client), client])
        .filter(([clientId]) => clientId)
    );
    const appointmentIdsWithTasks = new Set();
    const appointmentFallbackKeysWithTasks = new Set();

    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
      const appointmentId = getTaskAppointmentId(task);
      if (appointmentId) {
        appointmentIdsWithTasks.add(String(appointmentId));
      }

      const fallbackKey = buildAppointmentMatchKey(
        getClientId(task),
        task?.service_name || task?.service || task?.title || task?.name,
        getTaskDeadline(task)
      );

      if (fallbackKey) {
        appointmentFallbackKeysWithTasks.add(fallbackKey);
      }
    });

    return (Array.isArray(appointments) ? appointments : [])
      .map((row) =>
        normalizeAppointmentRow(
          row,
          activeClientsById,
          appointmentIdsWithTasks,
          appointmentFallbackKeysWithTasks
        )
      )
      .filter((appointment) => {
        return (
          appointment.id &&
          appointment.clientId &&
          appointment.serviceName &&
          isApprovedAppointmentStatus(appointment.status)
        );
      })
      .sort(compareAppointments);
  }, [activeClients, appointments, tasks]);

  const filteredAppointments = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();
    if (!query) return approvedAppointments;

    return approvedAppointments.filter((appointment) => {
      return [
        appointment.clientName,
        appointment.secondary,
        appointment.serviceName,
        appointment.date,
        appointment.approvedBy,
        appointment.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [approvedAppointments, search]);

  const columns = [
    {
      key: "clientName",
      header: "Client Name",
      render: (_, row) => (
        <div>
          <div className="font-medium text-slate-900">{row.clientName}</div>
          <div className="text-xs text-slate-500">{row.secondary || `Client ID: ${row.clientId}`}</div>
        </div>
      ),
    },
    { key: "serviceName", header: "Services" },
    {
      key: "date",
      header: "Date",
      render: (value) => formatAppointmentDate(value),
    },
    {
      key: "status",
      header: "Status",
      render: (value) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusPillClass(value)}`}>
          {value}
        </span>
      ),
    },
    {
      key: "approvedBy",
      header: "Approved By",
      render: (value) => value || "Admin / Secretary",
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (_, row) => {
        const isSelected = String(row.id) === String(selectedAppointmentId || "");
        const startLabel = row.hasTask ? "Task Created" : isSelected ? "Loaded" : "Start Tasks";

        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={row.hasTask}
              onClick={(event) => {
                event.stopPropagation();
                if (row.hasTask) return;
                onSelect?.(row);
              }}
            >
              {startLabel}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Card compact>
        <CardHeader>
          <CardTitle>Client Appointments</CardTitle>
          <CardDescription>
            Approved appointments appear here for review and task creation. Open any row to load the client, service, due date, and matching bundle tasks.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search appointments..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {filteredAppointments.length} approved appointment{filteredAppointments.length === 1 ? "" : "s"}
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={filteredAppointments}
            keyField="id"
            emptyMessage="Approved client appointments will appear here after an admin or secretary approves them."
            compact
          />
        </CardContent>
      </Card>
    </>
  );
}

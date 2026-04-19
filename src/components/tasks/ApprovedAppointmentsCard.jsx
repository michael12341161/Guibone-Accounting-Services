import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../UI/card";
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

function normalizeAppointmentRow(row, activeClientsById) {
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

  return {
    id,
    clientId,
    clientName: clientName || (clientId ? `Client #${clientId}` : "Unknown client"),
    secondary,
    serviceName,
    date,
    approvedBy: normalizeApprovedByLabel(approvedBy),
    status,
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
      .map((row) => normalizeAppointmentRow(row, activeClientsById))
      .filter((appointment) => {
        const appointmentFallbackKey = buildAppointmentMatchKey(
          appointment.clientId,
          appointment.serviceName,
          appointment.date
        );

        return (
          appointment.id &&
          appointment.clientId &&
          appointment.serviceName &&
          activeClientsById.has(appointment.clientId) &&
          isApprovedAppointmentStatus(appointment.status) &&
          !appointmentIdsWithTasks.has(String(appointment.id)) &&
          !appointmentFallbackKeysWithTasks.has(appointmentFallbackKey)
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
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [approvedAppointments, search]);

  const emptyMessage = approvedAppointments.length
    ? "No approved appointments match your search."
    : "Approved client appointments will appear here after an admin or secretary approves them.";

  return (
    <Card compact>
      <CardHeader>
        <CardTitle>Client Appointments</CardTitle>
        <CardDescription>
          Click an approved appointment to open Create Task with the client, service,
          due date, and matching bundle tasks already filled in.
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
              placeholder="Search appointment..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="inline-flex w-fit items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {filteredAppointments.length} approved appointment{filteredAppointments.length === 1 ? "" : "s"}
          </div>
        </div>

        {filteredAppointments.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredAppointments.map((appointment) => {
              const isSelected = String(appointment.id) === String(selectedAppointmentId || "");

              return (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => onSelect?.(appointment)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-indigo-200 bg-indigo-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {appointment.clientName}
                      </div>
                      {appointment.secondary ? (
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {appointment.secondary}
                        </div>
                      ) : null}
                    </div>

                    <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Approved
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Service
                      </div>
                      <div className="mt-1 font-medium text-slate-800">{appointment.serviceName}</div>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Date
                      </div>
                      <div className="mt-1 font-medium text-slate-800">
                        {formatAppointmentDate(appointment.date)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Approved By
                      </div>
                      <div className="mt-1 truncate font-medium text-slate-800">
                        {appointment.approvedBy || "Admin / Secretary"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      Opens Create Task. You only need to assign an accountant or secretary.
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isSelected ? "Loaded" : "Open Create Task"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {emptyMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

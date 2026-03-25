import React, { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "../services/api";
import { fetchPhilippinePublicHolidays, getCalendarYearsFromRange } from "../services/publicHolidays";
import Swal from "sweetalert2";

const SCHEDULING_CHANGED_EVENT = "client:scheduling:changed";

// Utility: parse metadata lines embedded in task description
// Supports lines like: [Priority] Low|Medium|High, [Deadline] DD/MM/YYYY or YYYY-MM-DD
function extractMetaFromDescription(desc) {
  const d = String(desc || "");
  const get = (key) => {
    const re = new RegExp(`^\\s*\\[${key}\\]\\s*([^\\r\\n]+)\\s*$`, "im");
    const m = d.match(re);
    return m ? String(m[1]).trim() : "";
  };
  return {
    priority: get("Priority"),
    deadline: get("Deadline"),
  };
}

// Normalize date string to ISO (YYYY-MM-DD) that FullCalendar accepts
function normalizeDueDate(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY -> YYYY-MM-DD
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Try to coerce via Date
  const dt = new Date(s);
  if (!isNaN(dt)) {
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function priorityColor(priorityRaw) {
  const p = String(priorityRaw || "").trim().toLowerCase();
  if (p === "high" || p === "urgent") return { bg: "#fecaca", text: "#991b1b", border: "#fca5a5" }; // red
  if (p === "medium") return { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" }; // yellow
  // default low
  return { bg: "#dcfce7", text: "#065f46", border: "#86efac" }; // green
}

function toTimeLabel(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const parts = v.split(":");
  if (parts.length < 2) return v;
  const hh = Number(parts[0]);
  const mm = parts[1];
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${ampm}`;
}

function readMetaLine(desc, key) {
  const text = String(desc || "");
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escaped}\\]\\s*([^\\r\\n]*)\\s*$`, "im");
  const m = text.match(re);
  return m ? String(m[1] || "").trim() : "";
}

function schedulingStatusMeta(statusRaw) {
  const s = String(statusRaw || "").trim().toLowerCase();
  if (s === "approved" || s === "active" || s === "confirmed") {
    return { label: "Approved", bg: "#dcfce7", text: "#065f46", border: "#86efac" };
  }
  if (s === "declined" || s === "cancelled" || s === "canceled") {
    return { label: "Declined", bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };
  }
  if (s === "completed" || s === "done") {
    return { label: "Completed", bg: "#e2e8f0", text: "#334155", border: "#cbd5e1" };
  }
  return { label: "Pending", bg: "#fef9c3", text: "#854d0e", border: "#fde68a" };
}

function normalizeSchedulingRow(row) {
  const desc = String(row?.Description ?? row?.description ?? "");
  const directDate = row?.Date ?? row?.date ?? "";
  const directTime = row?.Time ?? row?.time ?? readMetaLine(desc, "Time");
  const statusRaw = row?.Status ?? row?.status ?? row?.Status_name ?? row?.status_name ?? "Pending";
  const status = schedulingStatusMeta(statusRaw).label;
  const notes = row?.Notes ?? row?.notes ?? readMetaLine(desc, "Notes");
  const type = row?.Appointment_Type ?? row?.appointment_type ?? readMetaLine(desc, "Appointment_Type");
  const service = row?.Name ?? row?.service ?? row?.service_name ?? "Consultation";
  const clientName = row?.Client_name ?? row?.client_name ?? "";
  const id = row?.Scheduling_ID ?? row?.scheduling_id ?? row?.id ?? "";

  return {
    id: id ? String(id) : "",
    date: directDate ? String(directDate).slice(0, 10) : "",
    time: directTime ? String(directTime).slice(0, 5) : "",
    status,
    service: String(service || "Consultation"),
    clientName: String(clientName || ""),
    appointmentType: String(type || ""),
    notes: String(notes || ""),
    description: desc,
  };
}

function useSessionUser() {
  return useMemo(() => {
    try {
      const raw = localStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }, []);
}

export default function Calendar() {
  const sessionUser = useSessionUser();
  const roleId = sessionUser?.role_id;
  const isAdmin = roleId === 1;
  const isAccountant = roleId === 3;
  const isSecretary = roleId === 2;
  const canManageCalendar = isAdmin || isSecretary;
  const accountantId = sessionUser?.id || null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ===== Accountant state =====
  const [tasks, setTasks] = useState([]);

  // ===== Secretary state (announcements) =====
  // Backed by DB table (announcements)
  const [announcements, setAnnouncements] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [holidayYears, setHolidayYears] = useState([new Date().getFullYear()]);
  const [consultations, setConsultations] = useState([]);

  // FullCalendar events
  const [events, setEvents] = useState([]);

  const calendarStyles = `
  /* Scoped styles for the Calendar view */
  .acct-calendar-card .fc {
    --fc-border-color: #e2e8f0;            /* slate-200 */
    --fc-page-bg-color: transparent;
    --fc-today-bg-color: rgba(99, 102, 241, 0.10); /* indigo-500/10 */
    --fc-neutral-bg-color: #f8fafc;        /* slate-50 */
    --fc-button-bg-color: #ffffff;
    --fc-button-border-color: #e2e8f0;
    --fc-button-text-color: #334155;       /* slate-700 */
    --fc-button-hover-bg-color: #f8fafc;
    --fc-button-hover-border-color: #cbd5e1; /* slate-300 */
    --fc-button-active-bg-color: rgba(99, 102, 241, 0.12);
    --fc-button-active-border-color: rgba(99, 102, 241, 0.35);
    --fc-button-active-text-color: #4338ca; /* indigo-700 */
  }

  .acct-calendar-card .fc .fc-toolbar {
    margin-bottom: 0.75rem;
    padding: 0.75rem 0.75rem 0.25rem;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(to bottom, rgba(248,250,252,0.9), rgba(255,255,255,0));
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
  }

  .acct-calendar-card .fc .fc-toolbar-title {
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a; /* slate-900 */
    letter-spacing: -0.01em;
  }

  .acct-calendar-card .fc .fc-button {
    border-radius: 0.5rem;
    padding: 0.35rem 0.6rem;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
    transition: transform 120ms ease, background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    font-weight: 600;
  }

  .acct-calendar-card .fc .fc-button:focus {
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.18);
    outline: none;
  }

  .acct-calendar-card .fc .fc-button:hover {
    transform: translateY(-1px);
  }

  .acct-calendar-card .fc .fc-col-header-cell {
    background: #f8fafc; /* slate-50 */
  }

  .acct-calendar-card .fc .fc-col-header-cell-cushion {
    padding: 0.6rem 0.25rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #475569; /* slate-600 */
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .acct-calendar-card .fc .fc-daygrid-day-number,
  .acct-calendar-card .fc .fc-timegrid-axis-cushion,
  .acct-calendar-card .fc .fc-timegrid-slot-label-cushion {
    font-size: 0.75rem;
    color: #64748b; /* slate-500 */
  }

  .acct-calendar-card .fc .fc-daygrid-day.fc-day-today {
    border-radius: 0.75rem;
  }

  .acct-calendar-card .fc .fc-daygrid-event {
    border-radius: 0.6rem;
    padding: 0.125rem 0.25rem;
  }

  .acct-calendar-card .fc .fc-event {
    border-radius: 0.6rem;
  }

  .acct-calendar-card .fc .fc-event .fc-event-main {
    padding: 0.15rem 0.35rem;
  }

  .acct-calendar-card .fc .acct-event {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .acct-calendar-card .fc .acct-event-title {
    font-weight: 800;
    font-size: 0.75rem;
    line-height: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .acct-calendar-card .fc .acct-event-client {
    font-size: 0.7rem;
    line-height: 0.9rem;
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .acct-calendar-card .fc .fc-event:hover {
    filter: brightness(1.04);
  }
  html.dark .acct-calendar-card .fc {
    --fc-border-color: rgba(148, 163, 184, 0.18);
    --fc-page-bg-color: transparent;
    --fc-today-bg-color: rgba(16, 185, 129, 0.16);
    --fc-neutral-bg-color: rgba(15, 23, 42, 0.92);
    --fc-button-bg-color: #0f172a;
    --fc-button-border-color: rgba(148, 163, 184, 0.24);
    --fc-button-text-color: #cbd5e1;
    --fc-button-hover-bg-color: #1e293b;
    --fc-button-hover-border-color: rgba(148, 163, 184, 0.32);
    --fc-button-active-bg-color: rgba(16, 185, 129, 0.18);
    --fc-button-active-border-color: rgba(16, 185, 129, 0.36);
    --fc-button-active-text-color: #a7f3d0;
  }
  html.dark .acct-calendar-card .fc .fc-toolbar {
    border-bottom-color: rgba(148, 163, 184, 0.18);
    background: linear-gradient(to bottom, rgba(15,23,42,0.92), rgba(15,23,42,0));
  }
  html.dark .acct-calendar-card .fc .fc-toolbar-title {
    color: #e2e8f0;
  }
  html.dark .acct-calendar-card .fc .fc-col-header-cell {
    background: rgba(15, 23, 42, 0.92);
  }
  html.dark .acct-calendar-card .fc .fc-col-header-cell-cushion,
  html.dark .acct-calendar-card .fc .fc-daygrid-day-number,
  html.dark .acct-calendar-card .fc .fc-timegrid-axis-cushion,
  html.dark .acct-calendar-card .fc .fc-timegrid-slot-label-cushion {
    color: #94a3b8;
  }
  html.dark .acct-calendar-card .fc .fc-scrollgrid,
  html.dark .acct-calendar-card .fc .fc-timegrid-slot,
  html.dark .acct-calendar-card .fc .fc-timegrid-axis {
    background-color: transparent;
  }

  @media (prefers-reduced-motion: no-preference) {
    .acct-calendar-card .fc .fc-event {
      transition: filter 120ms ease, transform 120ms ease;
    }
    .acct-calendar-card .fc .fc-event:hover {
      transform: translateY(-1px);
    }
  }

  /* Ensure full-width calendar inside card */
  .acct-calendar-card .fc {
    width: 100%;
  }
  `;

  // Details modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const dialogRef = useRef(null);

  // Secretary: create/edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create"); // create|edit
  const [editorForm, setEditorForm] = useState({
    id: null,
    title: "",
    description: "",
    startDate: "",
  });

  const openCreate = () => {
    setError("");
    setEditorMode("create");
    setEditorForm({ id: null, title: "", description: "", startDate: "" });
    setEditorOpen(true);
  };

  const openEdit = (evt) => {
    setError("");
    setEditorMode("edit");
    setEditorForm({
      id: evt.id,
      title: evt.title || "Announcement",
      description: evt.description || "",
      startDate: String(evt.start || "").slice(0, 10),
    });

    setEditorOpen(true);
  };

  const deleteCalendarEvent = async (evt) => {
    try {
      setError("");
      await api.post("announcement_delete.php", { id: Number(evt.id) });
      const aRes = await api.get("announcement_list.php");
      setAnnouncements(Array.isArray(aRes.data?.announcements) ? aRes.data.announcements : []);
    } catch (e) {
      setError("Failed to delete event.");
    }
  };

  const upsertCalendarEvent = async () => {
    try {
      setError("");
      if (!editorForm.title.trim() || !editorForm.description.trim()) {
        setError("Announcement title and description are required.");
        return;
      }

      // Use a single date if provided; otherwise allow empty (announcement without a calendar date)
      const start_date = editorForm.startDate ? editorForm.startDate : null;

      if (editorMode === "edit" && editorForm.id) {
        await api.post("announcement_update.php", {
          id: Number(editorForm.id),
          title: editorForm.title.trim(),
          description: editorForm.description || "",
          start_date,
          end_date: null,
        });
      } else {
        await api.post("announcement_create.php", {
          title: editorForm.title.trim(),
          description: editorForm.description || "",
          start_date,
          end_date: null,
          created_by: sessionUser?.id || null,
        });
      }

      const aRes = await api.get("announcement_list.php");
      setAnnouncements(Array.isArray(aRes.data?.announcements) ? aRes.data.announcements : []);
      setEditorOpen(false);
    } catch (e) {
      setError("Failed to save event.");
    }
  };

  // Load announcements from backend
  useEffect(() => {
    if (!sessionUser) return;

    let alive = true;
    const load = async () => {
      setError("");
      try {
        const aRes = await api.get("announcement_list.php");

        if (!alive) return;
        setAnnouncements(Array.isArray(aRes.data?.announcements) ? aRes.data.announcements : []);
      } catch (e) {
        if (!alive) return;
        setError("Failed to load announcements.");
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [sessionUser]);

  useEffect(() => {
    if (!isSecretary && !isAccountant && !isAdmin) return;

    let alive = true;
    const load = async () => {
      try {
        const rows = await fetchPhilippinePublicHolidays(holidayYears);
        if (!alive) return;
        setHolidays(rows);
      } catch (_) {
        if (!alive) return;
        setHolidays([]);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [holidayYears, isSecretary, isAccountant, isAdmin]);

  // Admin/Secretary: fetch client scheduling requests for calendar display
  useEffect(() => {
    if (!canManageCalendar) return;

    let alive = true;

    const load = async () => {
      try {
        const res = await api.get("scheduling_list.php");
        const list = Array.isArray(res.data?.rows)
          ? res.data.rows
          : (Array.isArray(res.data?.scheduling) ? res.data.scheduling : (Array.isArray(res.data?.data) ? res.data.data : []));

        if (!alive) return;
        setConsultations(list.map(normalizeSchedulingRow));
      } catch (_) {
        if (!alive) return;
        setConsultations([]);
      }
    };

    load();
    const intv = setInterval(() => load(), 10000);
    const onSchedulingChanged = () => load();
    window.addEventListener(SCHEDULING_CHANGED_EVENT, onSchedulingChanged);

    return () => {
      alive = false;
      clearInterval(intv);
      window.removeEventListener(SCHEDULING_CHANGED_EVENT, onSchedulingChanged);
    };
  }, [canManageCalendar]);

  // Accountant: Fetch tasks assigned to this accountant; auto-refresh on interval
  useEffect(() => {
    if (!isAccountant) return;

    const load = async ({ silent } = { silent: false }) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const res = await api.get("task_list.php");
        const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
        const mine = accountantId
          ? list.filter((t) => (t.accountant_id || t.user_id || t.User_ID) === accountantId)
          : list;
        setTasks(mine);
      } catch (e) {
        setError("Failed to load tasks.");
      } finally {
        if (!silent) setLoading(false);
      }
    };

    load({ silent: false });
    const intv = setInterval(() => load({ silent: true }), 15000);

    return () => {
      clearInterval(intv);
    };
  }, [isAccountant, accountantId]);

  // Build task events (Accountant)
  const taskEvents = useMemo(() => {
    if (!isAccountant) return [];

    const evts = [];
    for (const t of tasks) {
      const meta = extractMetaFromDescription(t.description);
      const dueRaw = t.due_date || t.deadline || meta.deadline;
      const date = normalizeDueDate(dueRaw);
      if (!date) continue;

      const priorityValue = t.priority || t.task_priority || t.level || meta.priority || "Low";
      const colors = priorityColor(priorityValue);

      const rawTitle = t.title || t.name || "Untitled";
      const clientName = t.client_name || "";

      evts.push({
        id: `task:${String(t.id || t.Tasks_ID || Math.random())}`,
        title: rawTitle,
        start: date,
        end: date,
        allDay: true,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: colors.text,
        extendedProps: {
          kind: "task",
          task: {
            ...t,
            priority: priorityValue,
            due_date: date,
            client_name: clientName,
            title: rawTitle,
          },
        },
      });
    }
    return evts;
  }, [isAccountant, tasks]);

  // Build shared announcement events (Admin/Secretary manage; everyone can view)
  const sharedEvents = useMemo(() => {
    if (!isSecretary && !isAccountant && !isAdmin) return [];

    const blue = { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" };
    const red = { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };

    const aEvents = (Array.isArray(announcements) ? announcements : []).flatMap((a) => {
      const start = a.start_date ? String(a.start_date) : null;
      const end = a.end_date ? String(a.end_date) : start;

      // If no start_date, do not force today; just don't render on calendar.
      if (!start) return [];

      const allDay = true;

      return [
        {
          id: `announcement:${String(a.id)}`,
          title: a.title || "Announcement",
          start,
          end: end || undefined,
          allDay,
          backgroundColor: blue.bg,
          borderColor: blue.border,
          textColor: blue.text,
          extendedProps: {
            kind: "announcement",
            description: a.description || "",
            start,
            end: end || start,
            allDay,
            _rawId: String(a.id),
          },
        },
      ];
    });

    const hEvents = (Array.isArray(holidays) ? holidays : []).flatMap((holiday) => {
      const start = String(holiday?.date || "").slice(0, 10);
      if (!start) return [];

      return [
        {
          id: `holiday:${String(holiday.id || start)}`,
          title: holiday.title || "Holiday",
          start,
          end: start,
          allDay: true,
          backgroundColor: red.bg,
          borderColor: red.border,
          textColor: red.text,
          extendedProps: {
            kind: "holiday",
            description: holiday.description || "",
            localName: holiday.localName || holiday.title || "Holiday",
            englishName: holiday.englishName || holiday.title || "Holiday",
            start,
            end: start,
            allDay: true,
            _rawId: String(holiday.id || start),
          },
        },
      ];
    });

    return [...aEvents, ...hEvents];
  }, [isSecretary, isAccountant, isAdmin, announcements, holidays]);

  // Admin/Secretary: display client consultations from scheduling_list.php
  const consultationEvents = useMemo(() => {
    if (!canManageCalendar) return [];

    return (Array.isArray(consultations) ? consultations : [])
      .filter((c) => c.date)
      .map((c, idx) => {
        const statusMeta = schedulingStatusMeta(c.status);
        const start = c.time ? `${c.date}T${c.time}` : c.date;

        return {
          id: `consultation:${c.id || `${c.date}:${c.time}:${idx}`}`,
          title: c.service || "Consultation",
          start,
          allDay: !c.time,
          backgroundColor: statusMeta.bg,
          borderColor: statusMeta.border,
          textColor: statusMeta.text,
          extendedProps: {
            kind: "consultation",
            consultation: c,
          },
        };
      });
  }, [canManageCalendar, consultations]);

  // Combine events so shared announcements do not overwrite task events.
  useEffect(() => {
    const combined = [...sharedEvents, ...consultationEvents, ...taskEvents];
    setEvents(combined);
  }, [sharedEvents, consultationEvents, taskEvents]);

  const handleCalendarDatesSet = (info) => {
    const nextYears = getCalendarYearsFromRange(info?.start, info?.end);
    setHolidayYears((current) => (current.join(",") === nextYears.join(",") ? current : nextYears));
  };

  const handleEventClick = (info) => {
    const kind = info.event.extendedProps?.kind;

    if (kind === "announcement" || kind === "holiday") {
      setActiveTask({
        kind,
        id: info.event.extendedProps?._rawId || info.event.id,
        title: info.event.title,
        description: info.event.extendedProps?.description || "",
        start: info.event.extendedProps?.start || info.event.startStr,
        end: info.event.extendedProps?.end || info.event.endStr || info.event.startStr,
        allDay: !!info.event.allDay,
      });
      setModalOpen(true);
      return;
    }

    if (kind === "consultation") {
      const consultation = info.event.extendedProps?.consultation;
      if (!consultation) return;
      setActiveTask({
        kind: "consultation",
        title: consultation.service || info.event.title || "Consultation",
        ...consultation,
      });
      setModalOpen(true);
      return;
    }

    const t = info.event.extendedProps?.task;
    if (!t) return;
    setActiveTask({ kind: "task", ...t });
    setModalOpen(true);
  };

  const renderEventContent = (arg) => {
    const kind = arg.event.extendedProps?.kind;

    if (kind === "announcement" || kind === "holiday") {
      const title = arg.event.title || (kind === "holiday" ? "Holiday" : "Announcement");
      return (
        <div className="acct-event" title={title}>
          <div className="acct-event-title">{title}</div>
          <div className="acct-event-client">{kind === "holiday" ? "Holiday" : "Announcement"}</div>
        </div>
      );
    }

    if (kind === "consultation") {
      const c = arg.event.extendedProps?.consultation;
      const title = c?.service || arg.event.title || "Consultation";
      const subtitle = [c?.clientName || "", c?.time ? toTimeLabel(c.time) : ""].filter(Boolean).join(" | ");
      return (
        <div className="acct-event" title={subtitle ? `${title} - ${subtitle}` : title}>
          <div className="acct-event-title">{title}</div>
          {subtitle ? <div className="acct-event-client">{subtitle}</div> : null}
        </div>
      );
    }

    const t = arg.event.extendedProps?.task;
    const title = t?.title || arg.event.title || "Untitled";
    const client = t?.client_name || "";

    return (
      <div className="acct-event" title={client ? `${title} â€” ${client}` : title}>
        <div className="acct-event-title">{title}</div>
        {client ? <div className="acct-event-client">{client}</div> : null}
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <style dangerouslySetInnerHTML={{ __html: calendarStyles }} />

      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-800">{canManageCalendar ? "" : "Task Calendar"}</h2>
          <p className="text-xs text-slate-500">
            {canManageCalendar
              ? "Create announcements and view client consultations plus live Philippine public holidays. Click an event to view details."
              : "View your assigned tasks, announcements, and live Philippine public holidays by date. Click an event to see full details."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageCalendar ? (
            <>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                onClick={() => openCreate()}
              >
                + Announcement
              </button>
            </>
          ) : (
            loading && <div className="text-xs text-slate-500">Refreshingâ€¦</div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-xs font-semibold text-slate-700">Legend</div>

          {canManageCalendar ? (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: "#dbeafe", borderColor: "#93c5fd" }} aria-hidden="true" />
                <span className="font-medium">Announcements</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: "#fee2e2", borderColor: "#fca5a5" }} aria-hidden="true" />
                <span className="font-medium">Public Holidays</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: schedulingStatusMeta("Approved").bg, borderColor: schedulingStatusMeta("Approved").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">Consultation Approved</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: schedulingStatusMeta("Pending").bg, borderColor: schedulingStatusMeta("Pending").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">Consultation Pending</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: schedulingStatusMeta("Declined").bg, borderColor: schedulingStatusMeta("Declined").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">Consultation Declined</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: "#dbeafe", borderColor: "#93c5fd" }} aria-hidden="true" />
                <span className="font-medium">Announcements</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: "#fee2e2", borderColor: "#fca5a5" }} aria-hidden="true" />
                <span className="font-medium">Public Holidays</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: priorityColor("High").bg, borderColor: priorityColor("High").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">High</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: priorityColor("Medium").bg, borderColor: priorityColor("Medium").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">Medium</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: priorityColor("Low").bg, borderColor: priorityColor("Low").border }}
                  aria-hidden="true"
                />
                <span className="font-medium">Low</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Calendar */}
      <div className="acct-calendar-card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-2 sm:p-3">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            height="auto"
            contentHeight="auto"
            expandRows
            stickyHeaderDates
            events={events}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            eventDisplay="block"
            dayMaxEvents={3}
            datesSet={handleCalendarDatesSet}
            nowIndicator
          />
        </div>
      </div>

      {/* Details modal */}
      {modalOpen && activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/30" onClick={() => setModalOpen(false)} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-label="Event details"
            className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-800 truncate">
                  {activeTask.title || activeTask.name || (activeTask.kind === "holiday" ? "Holiday" : "Event")}
                </h3>
                {activeTask.kind === "task" ? (
                  <div className="mt-1 text-xs text-slate-500">Due on {normalizeDueDate(activeTask.due_date) || "-"}</div>
                ) : activeTask.kind === "consultation" ? (
                  <div className="mt-1 text-xs text-slate-500">
                    Consultation
                    {activeTask.date ? ` - ${activeTask.date}` : ""}
                    {activeTask.time ? ` ${toTimeLabel(activeTask.time)}` : ""}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">
                    {activeTask.kind === "holiday" ? "Holiday" : "Announcement"}
                    {activeTask.start ? ` - ${String(activeTask.start).slice(0, 16).replace("T", " ")}` : ""}
                    {activeTask.end && activeTask.end !== activeTask.start
                      ? ` -> ${String(activeTask.end).slice(0, 16).replace("T", " ")}`
                      : ""}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                x
              </button>
            </div>

            {activeTask.kind === "task" ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Client</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.client_name || "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Status</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.status || "Not Started"}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Priority</div>
                    <div className="mt-1 text-sm text-slate-800">{String(activeTask.priority || "Low").replace(/^\w/, (c) => c.toUpperCase())}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Accountant</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.accountant_name || "-"}</div>
                  </div>
                </div>

                {activeTask.description && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Description</div>
                    <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {String(activeTask.description)
                        .replace(/^\s*\[(Progress|Priority|Deadline)\]\s*.*$/gim, "")
                        .trim() || "-"}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTask.kind === "consultation" ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-slate-700">Status</div>
                  {(() => {
                    const meta = schedulingStatusMeta(activeTask.status);
                    return (
                      <span
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: meta.bg, color: meta.text, borderColor: meta.border }}
                      >
                        {meta.label}
                      </span>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Client</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.clientName || "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Type</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.appointmentType || "-"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Date</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.date || "-"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Time</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.time ? toTimeLabel(activeTask.time) : "-"}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Notes</div>
                  <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{activeTask.notes || "-"}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Type</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.kind === "holiday" ? "Holiday" : "Announcement"}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">All day</div>
                    <div className="mt-1 text-sm text-slate-800">{activeTask.allDay ? "Yes" : "No"}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {activeTask.kind === "holiday" ? "Holiday name" : "Description"}
                  </div>
                  <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{activeTask.description || "-"}</div>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {canManageCalendar && activeTask.kind === "announcement" && (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setModalOpen(false);
                      openEdit(activeTask);
                    }}
                  >
                    Edit
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                      onClick={async () => {
                        const result = await Swal.fire({
                          title: "Remove this event?",
                          text: "This will permanently remove the announcement.",
                          icon: "warning",
                          showCancelButton: true,
                          confirmButtonText: "Remove",
                          cancelButtonText: "Cancel",
                          confirmButtonColor: "#e11d48", // rose-600
                        });

                        if (!result.isConfirmed) return;

                        await deleteCalendarEvent(activeTask);
                        setModalOpen(false);

                        // show success only if we didn't set an error
                        await Swal.fire({
                          title: "Removed",
                          text: "The event has been removed.",
                          icon: "success",
                          timer: 1400,
                          showConfirmButton: false,
                        });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secretary create/edit modal */}
      {canManageCalendar && editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditorOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  {editorMode === "edit" ? "Edit" : "Add"} Announcement
                </h3>
                <div className="mt-1 text-xs text-slate-500">
                  Title, description, and optional date/time.
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                onClick={() => setEditorOpen(false)}
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Title</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                  value={editorForm.title}
                  onChange={(e) => setEditorForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Announcement title"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                  rows={4}
                  value={editorForm.description}
                  onChange={(e) => setEditorForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional details"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Date (optional)</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                  value={editorForm.startDate}
                  onChange={(e) => setEditorForm((f) => ({ ...f, startDate: e.target.value }))}
                />
                <div className="mt-1 text-[11px] text-slate-500">Leave empty to publish without a calendar date.</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                onClick={upsertCalendarEvent}
              >
                {editorMode === "edit" ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error banner (non-blocking) */}
      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    </div>
  );
}


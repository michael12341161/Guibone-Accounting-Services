import React, { useMemo, useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "../../services/api";
import { fetchPhilippinePublicHolidays, getCalendarYearsFromRange } from "../../services/publicHolidays";
import ClientLayout from "../../layouts/ClientLayout";
import DashboardHero from "../../components/layout/dashboard_hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { ModuleAccessGate } from "../../components/layout/module_access_gate";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useErrorToast } from "../../utils/feedback";
import { hasModuleAccess } from "../../utils/module_permissions";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";

const SCHEDULING_CHANGED_EVENT = "client:scheduling:changed";

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

function normalizeAppointmentStatus(statusRaw) {
  const status = String(statusRaw ?? "").trim();
  if (!status) return "Pending";

  const lower = status.toLowerCase();
  if (lower === "active" || lower === "confirmed" || lower === "approved") return "Approved";
  if (lower === "declined") return "Declined";
  if (lower === "pending") return "Pending";
  return status;
}

function readAppointmentMeta(descriptionRaw, key) {
  const description = String(descriptionRaw || "");
  const escKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*\\[${escKey}\\]\\s*([^\\r\\n]*)\\s*$`, "im");
  const match = description.match(re);
  return match ? String(match[1] || "").trim() : "";
}

function normalizeAppointmentRow(row, idx) {
  const description = String(row?.description || row?.Description || "");

  const service =
    row?.service ||
    row?.service_name ||
    row?.Services ||
    row?.Name ||
    readAppointmentMeta(description, "Service") ||
    "-";

  const meetingType =
    row?.meeting_type ||
    row?.meetingType ||
    row?.Appointment_Type ||
    readAppointmentMeta(description, "Appointment_Type") ||
    "-";

  const date = row?.date || row?.appointment_date || row?.Date || "";
  const time = row?.time || row?.appointment_time || row?.Time || readAppointmentMeta(description, "Time") || "";
  const status = normalizeAppointmentStatus(
    row?.status ||
      row?.Status ||
      row?.Status_name ||
      row?.status_name ||
      row?.appointment_status ||
      row?.Appointment_Status ||
      "Pending"
  );

  const notes =
    row?.notes ||
    row?.purpose ||
    row?.Notes ||
    row?.secretary_notes ||
    row?.staff_notes ||
    row?.admin_notes ||
    row?.remark ||
    row?.remarks ||
    row?.comment ||
    row?.comments ||
    readAppointmentMeta(description, "Notes") ||
    "-";

  return {
    id: row?.id || row?.appointment_id || row?.Appointment_ID || idx,
    service,
    meetingType,
    date,
    time,
    status,
    notes,
  };
}

function clampPercent(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseProgressFromDescription(desc) {
  if (!desc) return 0;
  const m = String(desc).match(/^\s*\[Progress\]\s*(\d{1,3})\s*$/gim);
  if (!m || !m.length) return 0;
  const last = m[m.length - 1];
  const n = last.match(/(\d{1,3})/);
  return clampPercent(n?.[1] ?? 0);
}

function parseDeclinedReasonFromDescription(desc) {
  if (!desc) return "";
  const m = String(desc).match(/^\s*\[Declined reason\]\s*(.+?)\s*$/im);
  return (m?.[1] ?? "").trim();
}

function workStatusMeta(statusText, progress) {
  const s = (statusText || "").toLowerCase();
  if (s.includes("declin")) {
    return { label: "Declined", pill: "bg-rose-500/10 text-rose-700 ring-1 ring-rose-200/60", bar: "bg-rose-500" };
  }
  if (s.includes("done") || s.includes("complete")) {
    return { label: "Completed", pill: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200/60", bar: "bg-emerald-500" };
  }
  if (progress > 0 || s.includes("ongo")) {
    return { label: "Ongoing", pill: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-200/60", bar: "bg-sky-500" };
  }
  return { label: "Pending", pill: "bg-slate-50 text-slate-700 ring-1 ring-slate-200", bar: "bg-slate-400" };
}

function normalizeWorkProgressRow(task) {
  const progress = parseProgressFromDescription(task?.description);
  const reason = parseDeclinedReasonFromDescription(task?.description);
  const meta = workStatusMeta(task?.status, progress);
  return {
    id: task?.id,
    serviceName: task?.name || task?.title || "(Unnamed service)",
    serviceType: task?.status || "",
    accountantName: task?.accountant_name || "Unassigned",
    status: meta.label,
    statusPill: meta.pill,
    barColor: meta.bar,
    progress,
    declinedReason: meta.label === "Declined" ? reason : "",
  };
}

const calendarStyles = `
  .client-dashboard-calendar .fc {
    --fc-border-color: #e2e8f0;
    --fc-page-bg-color: transparent;
    --fc-today-bg-color: rgba(99, 102, 241, 0.10);
    --fc-button-bg-color: #ffffff;
    --fc-button-border-color: #e2e8f0;
    --fc-button-text-color: #334155;
    --fc-button-hover-bg-color: #f8fafc;
    --fc-button-hover-border-color: #cbd5e1;
    --fc-button-active-bg-color: rgba(99, 102, 241, 0.12);
    --fc-button-active-border-color: rgba(99, 102, 241, 0.35);
    --fc-button-active-text-color: #4338ca;
  }
  .client-dashboard-calendar .fc .fc-toolbar {
    margin-bottom: 0.75rem;
    padding: 0.75rem 0.75rem 0.25rem;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(to bottom, rgba(248,250,252,0.9), rgba(255,255,255,0));
    border-top-left-radius: 0.75rem;
    border-top-right-radius: 0.75rem;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .client-dashboard-calendar .fc .fc-toolbar-chunk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }
  .client-dashboard-calendar .fc .fc-toolbar-title {
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
  }
  .client-dashboard-calendar .fc .fc-button {
    border-radius: 0.5rem;
    padding: 0.35rem 0.6rem;
    box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
    font-weight: 600;
  }
  .client-dashboard-calendar .fc .fc-event {
    border-radius: 0.6rem;
  }
  html.dark .client-dashboard-calendar .fc {
    --fc-border-color: rgba(148, 163, 184, 0.18);
    --fc-page-bg-color: transparent;
    --fc-today-bg-color: rgba(16, 185, 129, 0.16);
    --fc-button-bg-color: #0f172a;
    --fc-button-border-color: rgba(148, 163, 184, 0.24);
    --fc-button-text-color: #cbd5e1;
    --fc-button-hover-bg-color: #1e293b;
    --fc-button-hover-border-color: rgba(148, 163, 184, 0.32);
    --fc-button-active-bg-color: rgba(16, 185, 129, 0.18);
    --fc-button-active-border-color: rgba(16, 185, 129, 0.36);
    --fc-button-active-text-color: #a7f3d0;
  }
  html.dark .client-dashboard-calendar .fc .fc-toolbar {
    border-bottom-color: rgba(148, 163, 184, 0.18);
    background: linear-gradient(to bottom, rgba(15,23,42,0.92), rgba(15,23,42,0));
  }
  html.dark .client-dashboard-calendar .fc .fc-toolbar-title {
    color: #e2e8f0;
  }
  html.dark .client-dashboard-calendar .fc .fc-col-header-cell,
  html.dark .client-dashboard-calendar .fc .fc-scrollgrid,
  html.dark .client-dashboard-calendar .fc .fc-timegrid-slot,
  html.dark .client-dashboard-calendar .fc .fc-timegrid-axis {
    background-color: transparent;
  }
  html.dark .client-dashboard-calendar .fc .fc-col-header-cell-cushion,
  html.dark .client-dashboard-calendar .fc .fc-daygrid-day-number,
  html.dark .client-dashboard-calendar .fc .fc-timegrid-axis-cushion,
  html.dark .client-dashboard-calendar .fc .fc-timegrid-slot-label-cushion {
    color: #94a3b8;
  }
  @media (max-width: 1024px) {
    .client-dashboard-calendar .fc .fc-toolbar {
      padding: 0.6rem 0.6rem 0.25rem;
    }
    .client-dashboard-calendar .fc .fc-toolbar-title {
      font-size: 0.95rem;
    }
    .client-dashboard-calendar .fc .fc-button {
      padding: 0.3rem 0.45rem;
      font-size: 0.75rem;
    }
  }
`;

export default function ClientDashboard({ user, onLogout }) {
  const { permissions } = useModulePermissions();
  // Calendar data
  const sessionUser = useSessionUser();
  const clientId =
    sessionUser?.Client_id ??
    sessionUser?.Client_ID ??
    sessionUser?.client_id ??
    sessionUser?.clientId ??
    sessionUser?.id ??
    null;
  const [consultations, setConsultations] = useState([]); // scheduling consultations (tblscheduling)
  const [announcements, setAnnouncements] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [holidayYears, setHolidayYears] = useState([new Date().getFullYear()]);
  const [appointments, setAppointments] = useState([]);
  const [, setLoadingAppointments] = useState(true);
  const [workProgressRows, setWorkProgressRows] = useState([]);
  const [loadingWorkProgress, setLoadingWorkProgress] = useState(true);
  const [workProgressError, setWorkProgressError] = useState("");
  useErrorToast(workProgressError);

  const consultationQueryParams = {
    client_id: sessionUser?.client_id ?? sessionUser?.Client_ID ?? undefined,
    client_username: sessionUser?.username ?? undefined,
  };

  const appointmentQueryParams = {
    client_id: sessionUser?.client_id ?? sessionUser?.Client_ID ?? undefined,
    client_username: sessionUser?.username ?? undefined,
  };

  const normalizeConsultation = (r) => {
    const id = r?.Scheduling_ID ?? r?.scheduling_id ?? r?.id;
    const date = r?.Date ?? r?.date;
    const desc = String(r?.Description ?? r?.description ?? "");
    const time = r?.Time ?? r?.time ?? readAppointmentMeta(desc, "Time");
    const status = r?.Status ?? r?.status ?? "Pending";
    const title = r?.Title ?? r?.title ?? r?.Name ?? r?.name ?? "Consultation";
    const mode = r?.Appointment_Type ?? r?.appointment_type ?? readAppointmentMeta(desc, "Appointment_Type");
    const notes = r?.Notes ?? r?.notes ?? readAppointmentMeta(desc, "Notes");

    return {
      id: id != null ? String(id) : "",
      date: date ? String(date).slice(0, 10) : "",
      time: time ? String(time).slice(0, 5) : "",
      status,
      title,
      mode: mode ? String(mode) : "",
      notes: notes ? String(notes) : "",
      description: desc,
    };
  };

  const loadConsultations = async () => {
    try {
      const res = await api.get("scheduling_list.php", { params: consultationQueryParams });
      const list = Array.isArray(res.data?.rows) ? res.data.rows : [];

      const normalized = list.map(normalizeConsultation);
      setConsultations(normalized);
    } catch (_) {
      setConsultations([]);
    }
  };

  const loadAppointments = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoadingAppointments(true);

      const res = await api.get("appointment_list.php", { params: appointmentQueryParams });
      const list = res?.data?.appointments || res?.data?.rows || res?.data || [];
      const arr = Array.isArray(list) ? list : [];

      const myId = sessionUser?.client_id || sessionUser?.Client_ID;
      const myUsername = sessionUser?.username;
      const myFullName = joinPersonName([
        sessionUser?.first_name || sessionUser?.First_Name,
        sessionUser?.middle_name || sessionUser?.Middle_Name,
        sessionUser?.last_name || sessionUser?.Last_Name,
      ]);

      const matchesUser = (a) => {
        const cid = a?.client_id || a?.Client_ID || a?.clientId || a?.clientID;
        const cun = a?.client_username || a?.clientUsername || a?.client_user || a?.clientUser;
        const cemail = a?.client_email || a?.clientEmail;
        const cname = a?.client_name || a?.Client_name || a?.Client_Name;

        if (myId != null && cid != null && String(cid) === String(myId)) return true;
        if (myUsername && cun && String(cun).toLowerCase() === String(myUsername).toLowerCase()) return true;
        if (sessionUser?.email && cemail && String(cemail).toLowerCase() === String(sessionUser.email).toLowerCase()) {
          return true;
        }
        if (
          myFullName &&
          cname &&
          normalizeNameForComparison(cname) === normalizeNameForComparison(myFullName)
        ) return true;
        return false;
      };

      const mine = arr.filter(matchesUser);
      const selected = mine.length ? mine : arr;
      setAppointments(selected.map(normalizeAppointmentRow));
    } catch (_) {
      setAppointments([]);
    } finally {
      if (!silent) setLoadingAppointments(false);
    }
  };

  const loadSharedCalendarEvents = async () => {
    try {
      const aRes = await api.get("announcement_list.php");

      const aRows = Array.isArray(aRes?.data?.announcements)
        ? aRes.data.announcements
        : [];

      setAnnouncements(aRows);
    } catch (_) {
      setAnnouncements([]);
    }
  };

  const loadWorkProgress = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoadingWorkProgress(true);
      setWorkProgressError("");

      const sessionClientId = sessionUser?.client_id || sessionUser?.Client_ID;

      if (sessionClientId) {
        const res = await api.get("task_list.php", { params: { client_id: sessionClientId } });
        const rows = Array.isArray(res?.data?.tasks) ? res.data.tasks : [];
        setWorkProgressRows(rows.map(normalizeWorkProgressRow));
        return;
      }

      const clientName = joinPersonName([
        sessionUser?.first_name || sessionUser?.First_Name,
        sessionUser?.middle_name || sessionUser?.Middle_Name,
        sessionUser?.last_name || sessionUser?.Last_Name,
      ]);

      const allRes = await api.get("task_list.php");
      const allRows = Array.isArray(allRes?.data?.tasks) ? allRes.data.tasks : [];
      const filtered = clientName
        ? allRows.filter((t) => String(t?.client_name || "").toLowerCase() === clientName.toLowerCase())
        : allRows;

      setWorkProgressRows(filtered.map(normalizeWorkProgressRow));
    } catch (e) {
      setWorkProgressRows([]);
      if (!silent) {
        setWorkProgressError(e?.response?.data?.message || e?.message || "Failed to load work progress.");
      }
    } finally {
      if (!silent) setLoadingWorkProgress(false);
    }
  };
 
  const location = useLocation();
  const isDashboardRoute = location.pathname === "/client" || location.pathname === "/client/";
  const canViewDashboard = hasModuleAccess(user, "client-account", permissions);



  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    // Auto-refresh consultations for the calendar (no manual refresh).
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      await loadConsultations();
    };

    tick();
    const intv = setInterval(() => tick(), 10000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, canViewDashboard, isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      await loadSharedCalendarEvents();
    };

    tick();
    const intv = setInterval(() => tick(), 15000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewDashboard, isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    let mounted = true;

    (async () => {
      try {
        const rows = await fetchPhilippinePublicHolidays(holidayYears);
        if (!mounted) return;
        setHolidays(rows);
      } catch (_) {
        if (!mounted) return;
        setHolidays([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canViewDashboard, holidayYears, isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    const onSchedulingChanged = () => {
      loadConsultations();
    };
    window.addEventListener(SCHEDULING_CHANGED_EVENT, onSchedulingChanged);
    return () => window.removeEventListener(SCHEDULING_CHANGED_EVENT, onSchedulingChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, canViewDashboard, isDashboardRoute]);

  useEffect(() => {
    if (isDashboardRoute && canViewDashboard) {
      loadConsultations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, canViewDashboard, isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    let mounted = true;

    (async () => {
      if (!mounted) return;
      await loadAppointments({ silent: false });
    })();

    const intv = setInterval(() => {
      if (mounted) loadAppointments({ silent: true });
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, canViewDashboard, isDashboardRoute]);

  useEffect(() => {
    if (!isDashboardRoute || !canViewDashboard) {
      return undefined;
    }

    let mounted = true;

    (async () => {
      if (!mounted) return;
      await loadWorkProgress({ silent: false });
    })();

    const intv = setInterval(() => {
      if (mounted) loadWorkProgress({ silent: true });
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, canViewDashboard, isDashboardRoute]);

  const calendarEvents = useMemo(() => {
    const consultationEvents = consultations
      .filter((a) => a.date)
      .map((a) => {
        // Requirements: Pending=yellow, Approved=green, Declined=red
        const s = String(a.status || "Pending").toLowerCase();
        let colors;
        if (s === "active" || s === "approved" || s === "confirmed") colors = { bg: "#dcfce7", text: "#065f46", border: "#86efac" };
        else if (s === "declined") colors = { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };
        else colors = { bg: "#fef9c3", text: "#854d0e", border: "#fde68a" };

        const start = a.time ? `${a.date}T${a.time}` : a.date;

        return {
          id: `sched:${String(a.id)}`,
          title: a.title || "Consultation",
          start,
          allDay: !a.time,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: colors.text,
          extendedProps: { kind: "consultation", item: a },
        };
      });

    const announcementEvents = (Array.isArray(announcements) ? announcements : [])
      .flatMap((a) => {
        const start = String(a?.start_date || "").slice(0, 10);
        if (!start) return [];

        const end = String(a?.end_date || "").slice(0, 10);
        return [
          {
            id: `announcement:${String(a?.id ?? start)}`,
            title: a?.title || "Announcement",
            start,
            end: end || undefined,
            allDay: true,
            backgroundColor: "#dbeafe",
            borderColor: "#93c5fd",
            textColor: "#1e40af",
            extendedProps: { kind: "announcement" },
          },
        ];
      });

    const holidayEvents = (Array.isArray(holidays) ? holidays : [])
      .flatMap((holiday) => {
        const date = String(holiday?.date || "").slice(0, 10);
        if (!date) return [];

        return [
          {
            id: `holiday:${String(holiday?.id ?? date)}`,
            title: holiday?.title || "Holiday",
            start: date,
            end: date,
            allDay: true,
            backgroundColor: "#fee2e2",
            borderColor: "#fca5a5",
            textColor: "#991b1b",
            extendedProps: { kind: "holiday" },
          },
        ];
      });

    return [...announcementEvents, ...holidayEvents, ...consultationEvents];
  }, [consultations, announcements, holidays]);

  const scheduleStats = useMemo(() => {
    const stats = { total: consultations.length, pending: 0, confirmed: 0, declined: 0, completed: 0 };
    consultations.forEach((c) => {
      const s = String(c?.status || "Pending").toLowerCase();
      if (s === "active" || s === "approved" || s === "confirmed") stats.confirmed += 1;
      else if (s === "declined" || s === "cancelled") stats.declined += 1;
      else if (s === "completed" || s === "done") stats.completed += 1;
      else stats.pending += 1;
    });
    return stats;
  }, [consultations]);

  const appointmentStats = useMemo(() => {
    const stats = { total: appointments.length, pending: 0, approved: 0, declined: 0 };
    appointments.forEach((a) => {
      const s = String(normalizeAppointmentStatus(a?.status)).toLowerCase();
      if (s === "approved") stats.approved += 1;
      else if (s === "declined") stats.declined += 1;
      else stats.pending += 1;
    });
    return stats;
  }, [appointments]);

  const workProgressStats = useMemo(() => {
    const total = workProgressRows.length;
    const completed = workProgressRows.filter((r) => r.status === "Completed").length;
    const declined = workProgressRows.filter((r) => r.status === "Declined").length;
    const ongoing = workProgressRows.filter((r) => r.status === "Ongoing").length;
    const pending = Math.max(0, total - completed - declined - ongoing);

    const overallPercent = total
      ? Math.round(workProgressRows.reduce((sum, row) => sum + clampPercent(row.progress), 0) / total)
      : 0;

    let overallMeta;
    if (ongoing > 0) overallMeta = workStatusMeta("ongoing", overallPercent);
    else if (total > 0 && completed === total) overallMeta = workStatusMeta("completed", overallPercent);
    else if (declined > 0 && completed === 0 && ongoing === 0) overallMeta = workStatusMeta("declined", overallPercent);
    else overallMeta = workStatusMeta("pending", overallPercent);

    return { total, completed, declined, ongoing, pending, overallPercent, overallMeta };
  }, [workProgressRows]);

  const renderEventContent = (arg) => {
    const kind = arg.event.extendedProps?.kind;
    if (kind === "announcement" || kind === "holiday") {
      const title = arg.event.title || (kind === "holiday" ? "Holiday" : "Announcement");
      return (
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold leading-4 truncate">{title}</div>
          <div className="text-[10px] leading-3 opacity-90 truncate">
            {kind === "holiday" ? "Holiday" : "Announcement"}
          </div>
        </div>
      );
    }

    const item = arg.event.extendedProps?.item;
    const title = item?.title || arg.event.title;
    const status = item?.status ? String(item.status) : "";
    const sub = item?.time ? toTimeLabel(item.time) : status;

    return (
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold leading-4 truncate">{title}</div>
        {sub ? <div className="text-[10px] leading-3 opacity-90 truncate">{sub}</div> : null}
      </div>
    );
  };

  const handleCalendarDatesSet = (info) => {
    const nextYears = getCalendarYearsFromRange(info?.start, info?.end);
    setHolidayYears((current) => (current.join(",") === nextYears.join(",") ? current : nextYears));
  };
 
  return (
    <ClientLayout user={user} onLogout={onLogout}>
      <style dangerouslySetInnerHTML={{ __html: calendarStyles }} />

      {/* Page title intentionally hidden to match requested layout */}

      {/* Routed child content */}
      <Outlet />

      {/* Default dashboard content when at /client */}
      {(location.pathname === "/client" || location.pathname === "/client/") && (
        <ModuleAccessGate moduleKey="client-account">
          <>
            <DashboardHero user={user} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card compact>
                <CardHeader
                  title="Services"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4.5 21V7.5a1.5 1.5 0 0 1 1.5-1.5H18a1.5 1.5 0 0 1 1.5 1.5V21M8.25 10.5h.008v.008H8.25V10.5Zm3.75 0h.008v.008H12V10.5Zm3.75 0h.008v.008H15.75V10.5Z" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">0</p>
                  <CardDescription>Total services</CardDescription>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Appointments"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-sky-50 text-sky-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0 2-2H5a2 2 0 0 0 2 2v12a2 2 0 0 0 2 2Z" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-2">
                  <p className="text-3xl font-bold text-slate-900">{appointmentStats.total}</p>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                      Pending {appointmentStats.pending}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      Approved {appointmentStats.approved}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                      Declined {appointmentStats.declined}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Work Progress"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 4.5 4.5 10.5-10.5" />
                      </svg>
                    </div>
                  }
                />
                <CardContent>
                  {loadingWorkProgress ? (
                    <div className="text-sm text-slate-600">Loading...</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${workProgressStats.overallMeta.pill}`}>
                          {workProgressStats.overallMeta.label}
                        </span>
                        <span className="font-medium text-slate-700">{workProgressStats.overallPercent}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full ${workProgressStats.overallMeta.bar}`}
                          style={{ width: `${workProgressStats.overallPercent}%` }}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Scheduling"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-50 text-amber-700">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0 2-2H5a2 2 0 0 0 2 2v12a2 2 0 0 0 2 2Z" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-2">
                  <p className="text-3xl font-bold text-slate-900">{scheduleStats.total}</p>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      Confirmed {scheduleStats.confirmed}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                      Pending {scheduleStats.pending}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                      Declined {scheduleStats.declined}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4">
              <Card className="client-dashboard-calendar overflow-hidden" compact>
                <CardHeader>
                  <CardTitle>Calendar</CardTitle>
                  <CardDescription>Consultations, announcements, and live Philippine public holidays</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-3 pb-3">
                    <FullCalendar
                      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                      initialView="dayGridMonth"
                      headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
                      height="auto"
                      contentHeight="auto"
                      expandRows
                      stickyHeaderDates
                      nowIndicator
                      events={calendarEvents}
                      eventContent={renderEventContent}
                      eventDisplay="block"
                      dayMaxEvents={3}
                      datesSet={handleCalendarDatesSet}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        </ModuleAccessGate>
      )}
    </ClientLayout>
  );
}




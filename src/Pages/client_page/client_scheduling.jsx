import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { api } from "../../services/api";
import { showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";

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

function isoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalTodayISO() {
  return isoDate(new Date());
}

function statusBadge(statusRaw) {
  const s = String(statusRaw || "Pending").toLowerCase();
  if (s === "confirmed" || s === "approved" || s === "active") return { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "completed" || s === "done") return { label: "Completed", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" };
}

function toTimeLabel(value) {
  // expects HH:MM or HH:MM:SS
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

export default function ClientScheduling() {
  const sessionUser = useSessionUser();
  
  // Client linkage: support multiple naming variants used across the app/backends
  const clientId =
    sessionUser?.Client_id ??
    sessionUser?.Client_ID ??
    sessionUser?.client_id ??
    sessionUser?.clientId ??
    sessionUser?.id ??
    null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);

  const [timeSlots, setTimeSlots] = useState([]); // [{value,label}]
  const [appointments, setAppointments] = useState([]); // raw list from backend

  const [form, setForm] = useState({
    date: toLocalTodayISO(),
    time: "",
    mode: "Online", // Online|Onsite
    notes: "",
  });

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeAppt, setActiveAppt] = useState(null);

  const emitSchedulingChanged = () => {
    try {
      window.dispatchEvent(new CustomEvent(SCHEDULING_CHANGED_EVENT));
    } catch (_) {
      // no-op: best-effort UI sync signal
    }
  };

  // Calendar styles removed (calendar panel removed from scheduling page)

  const normalizeAppointment = (a) => {
    // handle scheduling_list.php rows and older appointment-style fallback rows
    const id = a?.Scheduling_ID ?? a?.scheduling_id ?? a?.id ?? a?.Appointment_ID ?? a?.appointment_id;
    const date = a?.Date ?? a?.date ?? a?.appointment_date;
    const status = a?.Status ?? a?.status ?? a?.Status_name ?? a?.status_name ?? a?.status_label ?? "Pending";

    // Try to infer time from description meta
    const desc = String(a?.Description ?? a?.description ?? "");
    const timeMatch = desc.match(/^\s*\[Time\]\s*([0-9]{1,2}:[0-9]{2})\s*$/im);
    const time = a?.Time ?? a?.time ?? a?.slot_time ?? (timeMatch ? timeMatch[1] : "");
    
    const modeMatch = desc.match(/^\s*\[Appointment_Type\]\s*(Online|Onsite)\s*$/im);
    const mode = a?.Appointment_Type ?? a?.appointment_type ?? (modeMatch ? String(modeMatch[1]).trim() : "");
    
    // Notes
    const notesMatch = desc.match(/^\s*\[Notes\]\s*([\s\S]*)$/im);
    const notes = a?.Notes ?? a?.notes ?? (notesMatch ? String(notesMatch[1]).trim() : "");

    // Title
    const title = a?.Name ?? a?.name ?? "Consultation";

    return {
      id: id ? String(id) : "",
      date: date ? String(date).slice(0, 10) : "",
      time: time ? String(time).slice(0, 5) : "",
      mode,
      status,
      title,
      description: desc,
      notes,
    };
  };

  const clientQueryParams = {
    client_id: sessionUser?.client_id ?? sessionUser?.Client_ID ?? undefined,
    client_username: sessionUser?.username ?? undefined,
  };

  const loadTimeSlots = async () => {
    // Requirement: fetch dynamically from DB.
    // We use scheduling_list.php so consultation requests approved/declined by secretary are reflected.

    // Default set if backend has no slot info
    const defaults = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"].map((t) => ({ value: t, label: toTimeLabel(t) }));

    try {
      const res = await api.get("scheduling_list.php", { params: clientQueryParams });
      const list = Array.isArray(res.data?.rows)
        ? res.data.rows
        : (Array.isArray(res.data?.scheduling) ? res.data.scheduling : (Array.isArray(res.data?.data) ? res.data.data : []));

      // If any appointment descriptions contain [Time] HH:MM, build a slot list from those + defaults
      const found = new Set();
      for (const a of list) {
        const direct = String(a?.Time ?? a?.time ?? "").trim();
        if (direct) {
          found.add(String(direct).slice(0, 5));
          continue;
        }
        const desc = String(a?.Description ?? a?.description ?? "");
        const m = desc.match(/^\s*\[Time\]\s*([0-9]{1,2}:[0-9]{2})\s*$/im);
        if (m) found.add(String(m[1]).slice(0, 5));
      }
      const merged = new Set(defaults.map((s) => s.value));
      for (const t of found) merged.add(t);
      const out = Array.from(merged)
        .sort()
        .map((t) => ({ value: t, label: toTimeLabel(t) }));

      setTimeSlots(out);
      if (!form.time && out.length) {
        setForm((f) => ({ ...f, time: out[0].value }));
      }
    } catch (_) {
      setTimeSlots(defaults);
      if (!form.time && defaults.length) {
        setForm((f) => ({ ...f, time: defaults[0].value }));
      }
    }
  };

  const loadAppointments = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.get("scheduling_list.php", { params: clientQueryParams });
      const list = Array.isArray(res.data?.rows)
        ? res.data.rows
        : (Array.isArray(res.data?.scheduling) ? res.data.scheduling : (Array.isArray(res.data?.data) ? res.data.data : []));

      const normalized = list.map(normalizeAppointment);
      setAppointments(normalized);
    } catch (e) {
      setError("Failed to load consultations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionUser) return;
    loadTimeSlots();
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, clientId]);

  const isPastDate = (dateStr) => {
    if (!dateStr) return true;
    // compare using local midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${dateStr}T00:00:00`);
    return d < today;
  };

  const isDoubleBooked = ({ date, time }, excludeId = null) => {
    if (!date || !time) return false;
    const t = String(time).slice(0, 5);
    return appointments.some((a) => {
      if (excludeId && String(a.id) === String(excludeId)) return false;
      const aTime = String(a.time || "").slice(0, 5);
      return a.date === date && aTime === t && String(a.status).toLowerCase() !== "cancelled";
    });
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setError("");

    if (!clientId) {
      setError("Client session not found. Please log out and log in again.");
      return;
    }
    if (!form.date) {
      setError("Consultation date is required.");
      return;
    }
    if (isPastDate(form.date)) {
      setError("You cannot select a past date.");
      return;
    }
    if (!form.time) {
      setError("Time slot is required.");
      return;
    }
    if (isDoubleBooked({ date: form.date, time: form.time })) {
      setError("That time slot is already booked. Please choose another slot.");
      return;
    }

    try {
      await api.post("/scheduling_create.php", {
        client_id: Number(clientId),
        service: "Consultation",
        appointment_type: "Consultation",
        meeting_type: form.mode === "Onsite" ? "Onsite" : "Online",
        date: form.date,
        time: String(form.time).slice(0, 5),
        notes: form.notes,
      });

      showSuccessToast({
        title: "Scheduled",
        description: "Your consultation request has been submitted.",
        duration: 1500,
      });

      // Stay on this page; just clear notes and refresh local list
      setForm((f) => ({ ...f, notes: "" }));
      await loadAppointments();
      emitSchedulingChanged();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to schedule consultation.");
    }
  };

  const onCancel = async (appt) => {
    // Backend doesn't currently expose appointment_cancel.php; use update_status endpoint if it supports it.
    // If not supported, we show a message.
    const res = await Swal.fire({
      title: "Cancel consultation?",
      text: "This will request cancellation of the scheduled consultation.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Cancel consultation",
      cancelButtonText: "Back",
      confirmButtonColor: "#e11d48",
    });

    if (!res.isConfirmed) return;

    try {
      // Try common payload shapes.
      await api.post("scheduling_update_status.php", {
        scheduling_id: Number(appt.id),
        status: "Cancelled",
      });

      showSuccessToast({
        title: "Cancelled",
        description: "Your consultation was cancelled.",
        duration: 1400,
      });

      setDetailsOpen(false);
      setActiveAppt(null);
      await loadAppointments();
      emitSchedulingChanged();
    } catch (e) {
      setError("Cancellation is not available right now.");
    }
  };

  const onReschedule = async (appt) => {
    const res = await Swal.fire({
      title: "Reschedule consultation",
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:12px;font-weight:600;margin:6px 0 2px">Date</label>
          <input id="swal-date" type="date" class="swal2-input" style="width:100%;margin:0" value="${appt.date || ""}" min="${toLocalTodayISO()}" />
          <label style="display:block;font-size:12px;font-weight:600;margin:10px 0 2px">Time</label>
          <select id="swal-time" class="swal2-select" style="width:100%;margin:0">
            ${(timeSlots.length ? timeSlots : [{ value: appt.time, label: toTimeLabel(appt.time) }])
              .map((s) => `<option value="${s.value}" ${String(s.value).slice(0,5) === String(appt.time).slice(0,5) ? "selected" : ""}>${s.label}</option>`)
              .join("")}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Reschedule",
      cancelButtonText: "Back",
      focusConfirm: false,
      preConfirm: () => {
        const date = document.getElementById("swal-date")?.value;
        const time = document.getElementById("swal-time")?.value;
        if (!date) {
          Swal.showValidationMessage("Date is required");
          return;
        }
        const d = new Date(`${date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (d < today) {
          Swal.showValidationMessage("Date cannot be in the past");
          return;
        }
        if (!time) {
          Swal.showValidationMessage("Time is required");
          return;
        }
        return { date, time: String(time).slice(0, 5) };
      },
    });

    if (!res.isConfirmed) return;

    const { date, time } = res.value;

    if (isDoubleBooked({ date, time }, appt.id)) {
      showErrorToast({
        title: "Unavailable",
        description: "That time slot is already booked. Please choose another.",
      });
      return;
    }

    try {
      // Try updating appointment date/time via existing endpoint if supported.
      // If not supported, this will fail and show message.
      const description = String(appt.description || "");
      const lines = description.split(/\r?\n/);
      const out = [];
      let hasTime = false;
      for (const line of lines) {
        if (/^\s*\[Time\]\s*/i.test(line)) {
          out.push(`[Time] ${time}`);
          hasTime = true;
        } else {
          out.push(line);
        }
      }
      if (!hasTime) out.push(`[Time] ${time}`);

      await api.post("appointment_update_status.php", {
        appointment_id: Number(appt.id),
        // Common backends often accept date + description updates in same endpoint; if yours doesn't,
        // it will error and we will fallback to message.
        date,
        description: out.join("\n"),
      });

      showSuccessToast({
        title: "Updated",
        description: "Your consultation has been rescheduled.",
        duration: 1400,
      });

      setDetailsOpen(false);
      setActiveAppt(null);
      await loadAppointments();
      emitSchedulingChanged();
    } catch (e) {
      setError("Rescheduling is not available right now.");
    }
  };

  // Calendar event rendering removed (calendar panel removed from scheduling page)

  const canModify = (appt) => {
    const s = String(appt?.status || "Pending").toLowerCase();
    return s === "pending" || s === "confirmed";
  };

  if (!sessionUser) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-700">Session not found. Please log in again.</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4">
        {/* Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Schedule Consultation</h2>
              <p className="mt-1 text-xs text-slate-500">For lacking or incomplete requirements.</p>
            </div>
            {loading ? <div className="text-xs text-slate-500">Loadingâ€¦</div> : null}
          </div>

          <form className="mt-4 space-y-3" onSubmit={onCreate}>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Consultation date</label>
              <input
                type="date"
                min={toLocalTodayISO()}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Time slot</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
              >
                {timeSlots.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">Slots are loaded dynamically when possible; booked slots are blocked by validation.</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Consultation type</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              >
                <option value="Online">Online</option>
                <option value="Onsite">Onsite</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Reason / notes (optional)</label>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-indigo-100"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Add context about missing requirementsâ€¦"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            ) : null}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              disabled={loading}
            >
              Schedule
            </button>
          </form>
        </div>

        </div>

      {/* Details modal */}
      {detailsOpen && activeAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetailsOpen(false)} />
          <div
            role="dialog"
            aria-label="Consultation details"
            className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-800 truncate">{activeAppt.title || "Consultation"}</h3>
                <div className="mt-1 text-xs text-slate-500">
                  {activeAppt.date ? activeAppt.date : ""}{activeAppt.time ? `${activeAppt.date ? " " : ""}${toTimeLabel(activeAppt.time)}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close"
              >
                Ã—
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">Status</div>
                {(() => {
                  const b = statusBadge(activeAppt.status);
                  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Type</div>
                  <div className="mt-1 text-sm text-slate-800">{activeAppt.mode || "â€”"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Time</div>
                  <div className="mt-1 text-sm text-slate-800">{activeAppt.time ? toTimeLabel(activeAppt.time) : "â€”"}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Notes</div>
                <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{activeAppt.notes || "â€”"}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {canModify(activeAppt) ? (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    onClick={() => onCancel(activeAppt)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                    onClick={() => onReschedule(activeAppt)}
                  >
                    Reschedule
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setDetailsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List (mobile-friendly fallback) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Your scheduled consultations</h3>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
            onClick={loadAppointments}
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.length ? (
                appointments.map((a) => {
                  const b = statusBadge(a.status);
                  return (
                    <tr
                      key={a.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        setActiveAppt(a);
                        setDetailsOpen(true);
                      }}
                    >
                      <td className="py-2 pr-4 text-slate-800 whitespace-nowrap">{a.date || "â€”"}</td>
                      <td className="py-2 pr-4 text-slate-700 whitespace-nowrap">{a.time ? toTimeLabel(a.time) : "â€”"}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 max-w-[22rem] truncate">{a.notes || "â€”"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-500">No consultations scheduled yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

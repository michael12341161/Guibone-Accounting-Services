import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ApprovedAppointmentsCard from "../../components/tasks/ApprovedAppointmentsCard";
import { api } from "../../services/api";
import { useErrorToast } from "../../utils/feedback";

function isActiveClient(client) {
  const statusText = String(client?.status || "").trim().toLowerCase();
  const statusId = Number(client?.status_id || 0);
  return statusText === "active" || statusId === 1;
}

export default function TaskClientAppointmentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  useErrorToast(error);

  const tasksPath = (() => {
    const p = location.pathname || "";
    if (p.startsWith("/admin")) return "/admin/tasks";
    if (p.startsWith("/accountant")) return "/accountant/tasks";
    return "/secretary/tasks";
  })();

  const activeClients = useMemo(() => {
    return (Array.isArray(clients) ? clients : []).filter(isActiveClient);
  }, [clients]);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        setError("");
        const [clientResponse, appointmentResponse, taskResponse] = await Promise.all([
          api.get("client_list.php"),
          api.get("appointment_list.php"),
          api.get("task_list.php").catch(() => null),
        ]);
        if (!active) return;

        const nextClients = Array.isArray(clientResponse?.data?.clients)
          ? clientResponse.data.clients
          : [];
        const nextAppointments = Array.isArray(appointmentResponse?.data?.appointments)
          ? appointmentResponse.data.appointments
          : Array.isArray(appointmentResponse?.data?.rows)
            ? appointmentResponse.data.rows
            : Array.isArray(appointmentResponse?.data)
              ? appointmentResponse.data
              : [];
        const nextTasks = Array.isArray(taskResponse?.data?.tasks)
          ? taskResponse.data.tasks
          : [];

        setClients(nextClients);
        setAppointments(nextAppointments);
        setTasks(nextTasks);
      } catch (err) {
        if (!active) return;
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Unable to load approved client appointments right now."
        );
        setClients([]);
        setAppointments([]);
        setTasks([]);
      }
    };

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSelect = (appointment) => {
    navigate(tasksPath, {
      state: {
        prefillTaskFromAppointment: appointment,
      },
    });
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <ApprovedAppointmentsCard
        appointments={appointments}
        tasks={tasks}
        activeClients={activeClients}
        selectedAppointmentId=""
        onSelect={handleSelect}
      />
    </div>
  );
}

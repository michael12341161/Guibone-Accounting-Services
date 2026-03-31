import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import SecretaryLayout, { secretaryNavItems } from "../../layouts/SecretaryLayout";
import { ModuleAccessGate } from "../../components/layout/module_access_gate";
import { resolveNavKey } from "../../components/layout/layout_utils";
import DashboardHero from "../../components/layout/dashboard_hero";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import PieChart from "../../components/charts/PieChart";
import Barchart from "../../components/charts/Barchart";
import { hasModuleAccess } from "../../utils/module_permissions";

const TASK_WINDOW_COLORS = {
  Today: "#6366f1",
  "This Week": "#0ea5e9",
  Other: "#94a3b8",
};

const SERVICE_TYPE_PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#64748b",
  "#a855f7",
];

export default function SecretaryDashboard({ user, onLogout }) {
  const { permissions } = useModulePermissions();
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [taskAddOpen, setTaskAddOpen] = useState(false);
  const [tLoading, setTLoading] = useState(false);
  const [tError, setTError] = useState("");
  const [tSuccess, setTSuccess] = useState("");
  const [taskForm, setTaskForm] = useState({ client_id: "", title: "", description: "", deadline: "", status: "Pending" });

  const location = useLocation();

  const currentKey = useMemo(
    () => resolveNavKey(location.pathname, secretaryNavItems, "/secretary"),
    [location.pathname]
  );
  const canViewDashboard = hasModuleAccess(user, "dashboard", permissions);

  const tasksByWindow = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    let todayCount = 0;
    let weekCount = 0;

    tasks.forEach((task) => {
      const raw = task?.due_date || task?.deadline || task?.Date || task?.date || "";
      if (!raw) return;
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) return;
      if (date >= startOfToday && date < endOfToday) {
        todayCount += 1;
      }
      if (date >= startOfWeek && date < endOfWeek) {
        weekCount += 1;
      }
    });

    return [
      { name: "Today", value: todayCount },
      { name: "This Week", value: weekCount },
    ];
  }, [tasks]);

  const clientsPerService = useMemo(() => {
    const serviceMap = new Map();
    tasks.forEach((task) => {
      const rawService = task?.service_name || task?.service || task?.Service_name || task?.Name || "";
      const service = String(rawService).trim() || "Other";
      const clientKey = task?.client_id ?? task?.client_name ?? task?.client ?? "Unknown";
      if (!serviceMap.has(service)) {
        serviceMap.set(service, new Set());
      }
      if (clientKey !== null && clientKey !== undefined && String(clientKey).trim() !== "") {
        serviceMap.get(service).add(String(clientKey));
      }
    });
    return Array.from(serviceMap.entries())
      .map(([name, set]) => ({ name, value: set.size }))
      .sort((a, b) => b.value - a.value);
  }, [tasks]);

  const serviceTypeColors = useMemo(() => {
    const colors = {};
    clientsPerService.forEach((item, index) => {
      colors[item.name] = SERVICE_TYPE_PALETTE[index % SERVICE_TYPE_PALETTE.length];
    });
    if (!colors.Other) {
      colors.Other = "#94a3b8";
    }
    return colors;
  }, [clientsPerService]);

  useEffect(() => {
    if (!canViewDashboard) {
      return undefined;
    }

    let stop = false;
    (async () => {
      try {
        const [c, t] = await Promise.all([
          api.get("client_list.php"),
          api.get("task_list.php"),
        ]);
        if (!stop) {
          if (Array.isArray(c.data?.clients)) setClients(c.data.clients);
          if (Array.isArray(t.data?.tasks)) setTasks(t.data.tasks);
        }
      } catch (_) {}
    })();
    const intv = setInterval(async () => {
      try {
        const t = await api.get("task_list.php");
        if (!stop && Array.isArray(t.data?.tasks)) setTasks(t.data.tasks);
      } catch (_) {}
    }, 10000);
    return () => {
      stop = true;
      clearInterval(intv);
    };
  }, [canViewDashboard]);

  const onOpenAddTask = () => {
    setTError("");
    setTSuccess("");
    setTaskForm({ client_id: "", title: "", description: "", deadline: "", status: "Pending" });
    setTaskAddOpen(true);
  };

  const handleTaskChange = (e) => {
    const { name, value } = e.target;
    setTaskForm((f) => ({ ...f, [name]: value }));
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setTError("");
    setTSuccess("");
    if (!taskForm.client_id || !taskForm.title) {
      setTError("Client and title are required.");
      return;
    }
    let dl = taskForm.deadline || null;
    if (dl) {
      dl = dl.replace("T", " ");
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dl)) dl += ":00";
    }
    try {
      setTLoading(true);
      const payload = {
        client_id: parseInt(taskForm.client_id, 10),
        title: taskForm.title,
        description: taskForm.description || null,
        deadline: dl,
        status: taskForm.status || "Pending",
      };
      const res = await api.post("task_create.php", payload);
      if (res?.data?.success) {
        try {
          const list = await api.get("task_list.php");
          if (Array.isArray(list.data?.tasks)) setTasks(list.data.tasks);
          else if (res.data?.task) setTasks((prev) => [res.data.task, ...prev]);
        } catch (_) {
          if (res.data?.task) setTasks((prev) => [res.data.task, ...prev]);
        }
        setTSuccess("Task created successfully.");
        setTaskAddOpen(false);
        setTaskForm({ client_id: "", title: "", description: "", deadline: "", status: "Pending" });
      } else {
        setTError(res?.data?.message || "Failed to create task.");
      }
    } catch (err) {
      setTError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setTLoading(false);
    }
  };

  void onOpenAddTask;
  void handleTaskChange;
  void handleCreateTask;
  void taskAddOpen;
  void tLoading;
  void tError;
  void tSuccess;
  void taskForm;

  return (
    <SecretaryLayout user={user} onLogout={onLogout}>
      {currentKey !== "client-management" &&
        currentKey !== "new-client-management" &&
        currentKey !== "documents" &&
        currentKey !== "business-status" &&
        currentKey !== "tasks" &&
        currentKey !== "appointments" &&
        currentKey !== "user-management" &&
        currentKey !== "work-update" &&
        (currentKey !== "dashboard" || canViewDashboard) && (
        currentKey === "dashboard" ? (
          <DashboardHero user={user} />
        ) : (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800">
              {currentKey === "scheduling"
                ? "Consultation"
                : currentKey.charAt(0).toUpperCase() + currentKey.slice(1)}
            </h1>
          </div>
        )
      )}

      <Outlet />

      {(location.pathname === "/secretary" || location.pathname === "/secretary/") && (
        <ModuleAccessGate moduleKey="dashboard">
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card compact>
                <CardHeader
                  title="Today's Appointments"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0 2-2H5a2 2 0 0 0 2 2v12a2 2 0 0 0 2 2Z" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-2">
                  <p className="text-3xl font-bold text-slate-900">0</p>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">Pending</span>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">Approved</span>
                    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">Declined</span>
                  </div>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Clients"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-sky-50 text-sky-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4Zm-8 0c1.657 0 3-1.79 3-4S9.657 3 8 3 5 4.79 5 7s1.343 4 3 4Zm0 2c-2.761 0-5 1.79-5 4v2h10v-2c0-2.21-2.239-4-5-4Zm8 0c-.48 0-.94.056-1.371.159 1.6.744 2.871 2.02 2.871 3.841v2h6v-2c0-2.21-2.239-4-5-4Z" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">{clients.length}</p>
                  <CardDescription>Total clients</CardDescription>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Tasks"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 4.5 4.5 10.5-10.5" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">{tasks.length}</p>
                  <CardDescription>Assigned tasks</CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card compact>
                <CardHeader>
                  <CardTitle>Tasks Due Today / This Week</CardTitle>
                  <CardDescription>Based on task due dates</CardDescription>
                </CardHeader>
                <CardContent>
                  <Barchart
                    data={tasksByWindow}
                    colors={TASK_WINDOW_COLORS}
                    barSize={46}
                    emptyLabel="No tasks with due dates yet."
                  />
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader>
                  <CardTitle>Clients Per Service Type</CardTitle>
                  <CardDescription>Unique clients per service</CardDescription>
                </CardHeader>
                <CardContent>
                  <PieChart
                    data={clientsPerService}
                    colors={serviceTypeColors}
                    emptyLabel="No service usage data yet."
                  />
                </CardContent>
              </Card>
            </div>

            <div className="mt-6" />
          </>
        </ModuleAccessGate>
      )}
    </SecretaryLayout>
  );
}

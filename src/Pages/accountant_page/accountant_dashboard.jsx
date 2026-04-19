import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import AccountantLayout, { accountantNavItems } from "../../layouts/AccountantLayout";
import { ModuleAccessGate } from "../../components/layout/module_access_gate";
import { resolveNavKey } from "../../components/layout/layout_utils";
import DashboardHero from "../../components/layout/dashboard_hero";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import PieChart from "../../components/charts/PieChart";
import Barchart from "../../components/charts/Barchart";
import { hasModuleAccess } from "../../utils/module_permissions";

const STATUS_COLORS = {
  Completed: "#10b981",
  Incomplete: "#f97316",
  "In Progress": "#0ea5e9",
  Declined: "#f43f5e",
  Pending: "#f59e0b",
  Other: "#94a3b8",
};

const PRIORITY_COLORS = {
  High: "#f43f5e",
  Medium: "#f59e0b",
  Low: "#10b981",
  Other: "#94a3b8",
};

const priorityMeta = (priorityRaw) => {
  const p = String(priorityRaw || "").trim().toLowerCase();
  if (p === "high" || p === "urgent") return { label: "High", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (p === "medium" || p === "normal") return { label: "Medium", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  if (p === "low") return { label: "Low", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { label: priorityRaw ? String(priorityRaw) : "-", cls: "bg-slate-50 text-slate-700 border-slate-200" };
};

const extractMetaFromDescription = (descRaw) => {
  const desc = String(descRaw || "");
  const get = (key) => {
    const re = new RegExp(`^\\s*\\[${key}\\]\\s*(.+?)\\s*$`, "im");
    const m = desc.match(re);
    return m?.[1]?.trim() || "";
  };
  return { priority: get("Priority"), deadline: get("Deadline"), progress: get("Progress") };
};

export default function AccountantDashboard({ user, onLogout }) {
  const { permissions } = useModulePermissions();
  const [tasks, setTasks] = useState([]);

  const persistedUser = (() => {
    try {
      const raw = sessionStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  })();
  const effectiveUser = user ?? persistedUser;
  const userId = effectiveUser?.id;
  const isVisibleToCurrentAccountant = (task) => {
    if (!userId) return true;
    const assigneeId = Number(task?.accountant_id || task?.user_id || task?.User_ID || 0);
    const partnerId = Number(task?.partner_id || 0);
    return assigneeId === Number(userId) || partnerId === Number(userId);
  };
  const location = useLocation();
  const currentKey = useMemo(
    () => resolveNavKey(location.pathname, accountantNavItems, "/accountant"),
    [location.pathname]
  );
  const isUserManagementPage = currentKey === "users" || currentKey === "permissions";
  const canViewDashboard = hasModuleAccess(user, "dashboard", permissions);

  useEffect(() => {
    if (!canViewDashboard) {
      return undefined;
    }

    let stop = false;
    (async () => {
      try {
        const res = await api.get("task_list.php");
        if (!stop) {
          const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
          const mine = userId ? list.filter(isVisibleToCurrentAccountant) : list;
          setTasks(mine);
        }
      } catch (e) {
        if (!stop) {
          // Swallow errors for now; dashboard cards will show zeroed data.
        }
      }
    })();

    const intv = setInterval(async () => {
      try {
        const res = await api.get("task_list.php");
        const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
        const mine = userId ? list.filter(isVisibleToCurrentAccountant) : list;
        setTasks(mine);
      } catch {}
    }, 15000);

    return () => {
      stop = true;
      clearInterval(intv);
    };
  }, [canViewDashboard, userId]);

  const totalWorks = tasks.length;
  const totalNotDoneWorks = tasks.filter((task) => {
    const status = String(task?.status || "pending").toLowerCase();
    return !["completed", "done"].includes(status);
  }).length;
  const completionRate = totalWorks > 0 ? Math.round(((totalWorks - totalNotDoneWorks) / totalWorks) * 100) : 0;

  const statusBreakdown = useMemo(() => {
    const counts = { Pending: 0, "In Progress": 0, Incomplete: 0, Completed: 0, Declined: 0 };
    tasks.forEach((task) => {
      const s = String(task?.status || "pending").toLowerCase();
      if (s === "completed" || s === "done") counts.Completed += 1;
      else if (s === "incomplete") counts.Incomplete += 1;
      else if (s.includes("progress") || s.includes("ongo")) counts["In Progress"] += 1;
      else if (s.includes("declined") || s.includes("cancelled") || s.includes("canceled") || s.includes("at risk")) {
        counts.Declined += 1;
      } else {
        counts.Pending += 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  const priorityBreakdown = useMemo(() => {
    const counts = { High: 0, Medium: 0, Low: 0, Other: 0 };
    tasks.forEach((task) => {
      const meta = extractMetaFromDescription(task?.description);
      const raw = task?.priority || task?.task_priority || task?.level || meta.priority;
      const label = priorityMeta(raw).label;
      if (label === "High") counts.High += 1;
      else if (label === "Medium") counts.Medium += 1;
      else if (label === "Low") counts.Low += 1;
      else counts.Other += 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [tasks]);

  return (
    <AccountantLayout user={user} onLogout={onLogout}>
      {!isUserManagementPage && !location.pathname.startsWith("/accountant/settings") && (
        currentKey === "dashboard" && canViewDashboard ? (
          <DashboardHero user={effectiveUser} />
        ) : currentKey !== "dashboard" ? (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800">
              {(() => {
                const hideTitle = [
                  "client-management",
                  "documents",
                  "certificate",
                  "certificate-menu",
                  "certificate-view",
                  "edit-certificate",
                  "business-status",
                  "client-list",
                  "new-client-management",
                  "appointments",
                  "scheduling",
                  "tasks",
                  "work-update",
                  "reports",
                  "task-management",
                  "messaging",
                  "calendar",
                  "settings",
                ];
                if (hideTitle.includes(currentKey)) {
                  return "";
                }
                return currentKey.charAt(0).toUpperCase() + currentKey.slice(1);
              })()}
            </h1>
          </div>
        ) : null
      )}

      <Outlet />

      {(location.pathname === "/accountant" || location.pathname === "/accountant/") && (
        <ModuleAccessGate moduleKey="dashboard">
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card compact>
                <CardHeader
                  title="Total Works"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">{totalWorks}</p>
                  <CardDescription>All assigned works</CardDescription>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Total Not Done Works"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-rose-50 text-rose-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">{totalNotDoneWorks}</p>
                  <CardDescription>Pending or not started</CardDescription>
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader
                  title="Completion Rate"
                  action={
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">{completionRate}%</p>
                  <CardDescription>Based on completed tasks</CardDescription>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card compact>
                <CardHeader>
                  <CardTitle>Total Works</CardTitle>
                  <CardDescription>Distribution of your assigned tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <PieChart
                    data={statusBreakdown}
                    colors={STATUS_COLORS}
                    emptyLabel="No task data yet."
                  />
                </CardContent>
              </Card>

              <Card compact>
                <CardHeader>
                  <CardTitle>Priority Mix</CardTitle>
                  <CardDescription>High vs medium vs low priorities</CardDescription>
                </CardHeader>
                <CardContent>
                  <Barchart
                    data={priorityBreakdown}
                    colors={PRIORITY_COLORS}
                    barSize={36}
                    emptyLabel="No priority data yet."
                  />
                </CardContent>
              </Card>
            </div>

            <div className="mt-6" />
          </>
        </ModuleAccessGate>
      )}
    </AccountantLayout>
  );
}

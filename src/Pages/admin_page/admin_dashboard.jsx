import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { api } from "../../services/api";
import AdminLayout, { adminNavItems } from "../../layouts/AdminLayout";
import { resolveNavKey } from "../../components/layout/layout_utils";
import DashboardHero from "../../components/layout/dashboard_hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import PieChart from "../../components/charts/PieChart";
import Barchart from "../../components/charts/Barchart";

const ROLE_COLORS = {
  Admin: "#6366f1",
  Secretary: "#0ea5e9",
  Accountant: "#10b981",
  Worker: "#f59e0b",
  Client: "#8b5cf6",
  Other: "#94a3b8",
};

const APPROVAL_COLORS = {
  Approved: "#10b981",
  Pending: "#f59e0b",
  Rejected: "#f43f5e",
  Other: "#94a3b8",
};

const CLIENT_MONTH_BAR_COLORS = { Other: "#6366f1" };
const CLIENT_MONTHS_TO_SHOW = 12;
const SERVICE_USAGE_PALETTE = [
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

export default function AdminDashboard({ user, onLogout }) {
  const [totals, setTotals] = useState({
    clients: 0,
    secretaries: 0,
    tasks: 0,
    appointments: 0,
  });
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [roleBreakdown, setRoleBreakdown] = useState([]);
  const [clientApprovalBreakdown, setClientApprovalBreakdown] = useState([]);
  const [clientMonthlyBreakdown, setClientMonthlyBreakdown] = useState([]);
  const [serviceUsageBreakdown, setServiceUsageBreakdown] = useState([]);

  const location = useLocation();

  const loadTotals = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setTotalsLoading(true);

      const [clientsRes, usersRes, tasksRes, apptRes] = await Promise.all([
        api.get("client_list.php").catch(() => null),
        api.get("user_list.php").catch(() => null),
        api.get("task_list.php").catch(() => null),
        api.get("appointment_list.php").catch(() => null),
      ]);

      const clients = Array.isArray(clientsRes?.data?.clients) ? clientsRes.data.clients : [];
      const users = Array.isArray(usersRes?.data?.users) ? usersRes.data.users : [];
      const tasks = Array.isArray(tasksRes?.data?.tasks) ? tasksRes.data.tasks : [];
      const appts = Array.isArray(apptRes?.data?.appointments)
        ? apptRes.data.appointments
        : (Array.isArray(apptRes?.data?.data) ? apptRes.data.data : []);

      const secretaries = users.filter((u) => {
        const role = String(u?.role || "").toLowerCase();
        return role === "accountant" || role === "secretary";
      });

      setTotals({
        clients: clients.length,
        secretaries: secretaries.length,
        tasks: tasks.length,
        appointments: appts.length,
      });

      const roleCounts = { Admin: 0, Secretary: 0, Accountant: 0, Worker: 0, Client: 0, Other: 0 };
      users.forEach((u) => {
        const raw = String(u?.role || u?.Role || u?.role_name || u?.user_type || u?.position || "").toLowerCase();
        if (raw.includes("admin")) roleCounts.Admin += 1;
        else if (raw.includes("secretary")) roleCounts.Secretary += 1;
        else if (raw.includes("accountant")) roleCounts.Accountant += 1;
        else if (raw.includes("worker")) roleCounts.Worker += 1;
        else if (raw.includes("client")) roleCounts.Client += 1;
        else roleCounts.Other += 1;
      });
      setRoleBreakdown(
        Object.entries(roleCounts)
          .filter(([name]) => name !== "Worker" && name !== "Other")
          .map(([name, value]) => ({ name, value }))
      );

      const approvalCounts = { Approved: 0, Pending: 0, Rejected: 0, Other: 0 };
      clients.forEach((c) => {
        const raw = String(c?.approval_status || c?.status || "").toLowerCase();
        if (raw.includes("approved")) approvalCounts.Approved += 1;
        else if (raw.includes("rejected") || raw.includes("declined")) approvalCounts.Rejected += 1;
        else if (raw.includes("pending") || raw === "") approvalCounts.Pending += 1;
        else approvalCounts.Other += 1;
      });
      setClientApprovalBreakdown(Object.entries(approvalCounts).map(([name, value]) => ({ name, value })));

      const now = new Date();
      const monthList = [];
      for (let i = CLIENT_MONTHS_TO_SHOW - 1; i >= 0; i -= 1) {
        monthList.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
      }
      const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthCounts = new Map(monthList.map((d) => [monthKey(d), 0]));
      clients.forEach((c) => {
        const raw = c?.registered_at || c?.registeredAt || c?.created_at || c?.createdAt;
        if (!raw) return;
        const date = new Date(String(raw));
        if (Number.isNaN(date.getTime())) return;
        const key = monthKey(date);
        if (monthCounts.has(key)) {
          monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
        }
      });
      const monthlyData = monthList.map((d) => ({
        name: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        value: monthCounts.get(monthKey(d)) || 0,
      }));
      setClientMonthlyBreakdown(monthlyData);

      const serviceCounts = new Map();
      tasks.forEach((t) => {
        const raw = t?.service_name || t?.service || t?.Service_name || t?.Name || "";
        const name = String(raw).trim() || "Other";
        serviceCounts.set(name, (serviceCounts.get(name) || 0) + 1);
      });
      const serviceData = Array.from(serviceCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
      setServiceUsageBreakdown(serviceData);
    } finally {
      if (!silent) setTotalsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      loadTotals({ silent: false });
    }

    const intv = setInterval(() => {
      if (!mounted) return;
      if (location.pathname === "/admin" || location.pathname === "/admin/") {
        loadTotals({ silent: true });
      }
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const summaryCards = useMemo(() => {
    return [
      {
        key: "clients",
        label: "Clients",
        value: totals.clients,
        sub: "Total registered clients",
        iconBg: "bg-indigo-50 text-indigo-600",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
          </svg>
        ),
      },
      {
        key: "secretaries",
        label: "Secretaries / Accountants",
        value: totals.secretaries,
        sub: "Users with role Accountant/Secretary",
        iconBg: "bg-sky-50 text-sky-600",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4Zm-8 0c1.657 0 3-1.79 3-4S9.657 3 8 3 5 4.79 5 7s1.343 4 3 4Zm0 2c-2.761 0-5 1.79-5 4v2h10v-2c0-2.21-2.239-4-5-4Zm8 0c-.48 0-.94.056-1.371.159 1.6.744 2.871 2.02 2.871 3.841v2h6v-2c0-2.21-2.239-4-5-4Z" />
          </svg>
        ),
      },
      {
        key: "tasks",
        label: "Tasks",
        value: totals.tasks,
        sub: "Total tasks in the system",
        iconBg: "bg-amber-50 text-amber-600",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-6-8h6M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          </svg>
        ),
      },
      {
        key: "appointments",
        label: "Appointments",
        value: totals.appointments,
        sub: "Total scheduled appointments",
        iconBg: "bg-emerald-50 text-emerald-600",
        icon: (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
          </svg>
        ),
      },
    ];
  }, [totals]);

  const serviceUsageColors = useMemo(() => {
    const colors = {};
    serviceUsageBreakdown.forEach((item, index) => {
      colors[item.name] = SERVICE_USAGE_PALETTE[index % SERVICE_USAGE_PALETTE.length];
    });
    if (!colors.Other) {
      colors.Other = "#94a3b8";
    }
    return colors;
  }, [serviceUsageBreakdown]);

  const currentKey = useMemo(
    () => resolveNavKey(location.pathname, adminNavItems, "/admin"),
    [location.pathname]
  );
  const isUserManagementPage = currentKey === "users" || currentKey === "permissions";

  return (
    <AdminLayout user={user} onLogout={onLogout}>
      {!isUserManagementPage && !location.pathname.startsWith("/admin/settings") && (
        currentKey === "dashboard" ? (
          <DashboardHero user={user} />
        ) : (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-800">
              {(() => {
                if (currentKey === "client-management") return "";
                if (currentKey === "documents") return "";
                if (currentKey === "certificate") return "";
                if (currentKey === "certificate-menu") return "";
                if (currentKey === "certificate-view") return "";
                if (currentKey === "edit-certificate") return "";
                if (currentKey === "business-status") return "";
                if (currentKey === "client-list") return "";
                if (currentKey === "new-client-management") return "";
                if (currentKey === "appointments") return "";
                if (currentKey === "scheduling") return "";
                if (currentKey === "tasks") return "";
                if (currentKey === "work-update") return "";
                if (currentKey === "reports") return "";
                return currentKey.charAt(0).toUpperCase() + currentKey.slice(1);
              })()}
            </h1>
          </div>
        )
      )}

      <Outlet />

      {location.pathname === "/admin" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((c) => (
              <Card key={c.key} compact>
                <CardHeader
                  title={c.label}
                  action={
                    <div className={`grid h-8 w-8 place-items-center rounded-full ${c.iconBg}`}>
                      {c.icon}
                    </div>
                  }
                />
                <CardContent className="space-y-1">
                  <p className="text-3xl font-bold text-slate-900">
                    {totalsLoading ? "..." : c.value}
                  </p>
                  <CardDescription>{c.sub}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card compact>
              <CardHeader>
                <CardTitle>Client Approval Status</CardTitle>
                <CardDescription>Approved vs pending vs rejected</CardDescription>
              </CardHeader>
              <CardContent>
                <PieChart
                  data={clientApprovalBreakdown}
                  colors={APPROVAL_COLORS}
                  emptyLabel="No client data yet."
                />
              </CardContent>
            </Card>

            <Card compact>
              <CardHeader>
                <CardTitle>User Roles</CardTitle>
                <CardDescription>Account distribution by role</CardDescription>
              </CardHeader>
              <CardContent>
                <Barchart
                  data={roleBreakdown}
                  colors={ROLE_COLORS}
                  barSize={34}
                  emptyLabel="No user data yet."
                />
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card compact>
              <CardHeader>
                <CardTitle>Services Usage</CardTitle>
                <CardDescription>Most requested services from tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <PieChart
                  data={serviceUsageBreakdown}
                  colors={serviceUsageColors}
                  emptyLabel="No service usage data yet."
                />
              </CardContent>
            </Card>

            <Card compact>
              <CardHeader>
                <CardTitle>Clients Per Month</CardTitle>
                <CardDescription>Last {CLIENT_MONTHS_TO_SHOW} months</CardDescription>
              </CardHeader>
              <CardContent>
                <Barchart
                  data={clientMonthlyBreakdown}
                  colors={CLIENT_MONTH_BAR_COLORS}
                  barSize={24}
                  emptyLabel="No client registration data yet."
                />
              </CardContent>
            </Card>
          </div>

          <div className="mt-6" />
        </>
      )}
    </AdminLayout>
  );
}

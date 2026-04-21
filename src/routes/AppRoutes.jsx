import React from "react";
import { Navigate, createBrowserRouter, useNavigate } from "react-router-dom";
import LandingPage from "../Pages/landing_page/landing_page";
import LoginPage from "../Pages/auth/login";
import SignUpPage from "../Pages/auth/sign_up";
import { getHomePathForRole } from "../context/AuthContext";
import { useAuth } from "../hooks/useAuth";
import AdminDashboard from "../Pages/admin_page/admin_dashboard";
import UserManagement from "../Pages/admin_page/user_management";
import InactiveEmployee from "../Pages/admin_page/inactive_employee";
import Permissions from "../Pages/admin_page/permission";
import ClientManagement from "../Pages/admin_page/client_management";
import InactiveClients from "../Pages/admin_page/inactive_clients";
import NewClientManagement from "../Pages/admin_page/new_client_management";
import DocumentAdminPage from "../Pages/admin_page/document_admin";
import ClientBusinessStatusPage from "../Pages/admin_page/client_business_status";
import SecretaryDashboard from "../Pages/secretary_page/secretary_dashboard";
import AccountantDashboard from "../Pages/accountant_page/accountant_dashboard";
import ClientDashboard from "../Pages/client_page/client_dashboard";
import BusinessPage from "../Pages/client_page/business";
import WorkProgress from "../Pages/client_page/work_progress";
import ClientAppointment from "../Pages/client_page/client_appointment";
import ClientDocumentsPage from "../Pages/client_page/document";
import ClientCertificatePage from "../Pages/client_page/client_certificate";
import ClientManagementSecretary from "../Pages/secretary_page/client_management_secretary";
import SecretaryTaskManagement from "../Pages/secretary_page/task_management_secretary";
import AppointmentManagement from "../Pages/secretary_page/appointment_management";
import SchedulingManagementSecretary from "../Pages/secretary_page/scheduling_management_secretary";
import WorkUpdate from "../Pages/secretary_page/work_update";
import SecretaryReports from "../Pages/secretary_page/secretary_reports";
import AdminAppointmentManagement from "../Pages/admin_page/client_appointment";
import AdminWorkUpdate from "../Pages/admin_page/accountant_work_update";
import AdminAccountantTaskManagement from "../Pages/admin_page/accountant_task";
import AdminReports from "../Pages/admin_page/admin_reports";
import NewServices from "../Pages/admin_page/new_services";
import NewRole from "../Pages/admin_page/new_role";
import NewSpecialization from "../Pages/admin_page/new_specialization";
import ClientHistory from "../Pages/history/client_history";
import TasksUpdateHistory from "../Pages/history/tasks_update_history";
import MyTasks from "../Pages/accountant_page/my_tasks";
import MessagingPage from "../Pages/messaging_page/messaging_page";
import Calendar from "../calendar/calendary";
import AdminSettings from "../settings/admin_settings";
import SchedulingManagementAdmin from "../Pages/admin_page/scheduling_management_admin";
import CertificatePage from "../Pages/certificate/certificate";
import EditCertificate from "../Pages/certificate/Edit_certificate";
import { ModuleAccessGate } from "../components/layout/module_access_gate";
import TaskClientAppointmentsPage from "../Pages/shared/task_client_appointments";
import { RouteLoadingPanel } from "../components/layout/route_loading_panel";

function RoleProtectedRoute({ allowedRoleId, LayoutComponent }) {
  const navigate = useNavigate();
  const { user, role, logout, isAuthReady } = useAuth();
  const hasResolvedUser = Boolean(user?.id || user?.username);

  const onLogout = async () => {
    const didLogout = await logout();
    if (!didLogout) {
      return;
    }

    navigate("/login", { replace: true });
  };

  if (!isAuthReady && !hasResolvedUser) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <RouteLoadingPanel />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role !== allowedRoleId) {
    return <Navigate to={getHomePathForRole(user.role_id)} replace />;
  }

  return <LayoutComponent user={user} onLogout={onLogout} />;
}

function NotFoundPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>404 - Not Found</h1>
      <p>Route does not exist.</p>
    </div>
  );
}

function withModuleAccess(moduleKey, element, actionKey = null) {
  return (
    <ModuleAccessGate moduleKey={moduleKey} actionKey={actionKey}>
      {element}
    </ModuleAccessGate>
  );
}

const publicRoutes = [
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/sign-up", element: <SignUpPage /> },
];

const privateRouteGroups = [
  {
    path: "/admin",
    roleId: 1,
    component: AdminDashboard,
    children: [
      { path: "appointments", element: withModuleAccess("appointments", <AdminAppointmentManagement />) },
      { path: "work-update/history", element: withModuleAccess("work-update", <TasksUpdateHistory />, "history") },
      { path: "work-update", element: withModuleAccess("work-update", <AdminWorkUpdate />) },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "settings", element: withModuleAccess("settings", <AdminSettings />) },
      { path: "users", element: withModuleAccess("user-management", <UserManagement />) },
      { path: "users/inactive-users", element: withModuleAccess("user-management", <InactiveEmployee />) },
      { path: "permissions", element: withModuleAccess("permissions", <Permissions />) },
      { path: "new-specialization", element: withModuleAccess("user-management", <NewSpecialization />) },
      { path: "new-role", element: withModuleAccess("user-management", <NewRole />) },
      { path: "client-management", element: withModuleAccess("client-management", <ClientManagement />) },
      { path: "client-management/inactive-users", element: withModuleAccess("client-management", <InactiveClients />) },
      { path: "documents", element: withModuleAccess("documents", <DocumentAdminPage />) },
      { path: "certificate", element: withModuleAccess("certificate", <CertificatePage />) },
      { path: "certificate/edit", element: withModuleAccess("edit-certificate", <EditCertificate />) },
      { path: "business-status", element: withModuleAccess("business-status", <ClientBusinessStatusPage />) },
      { path: "new-client-management", element: withModuleAccess("new-client-management", <NewClientManagement />) },
      { path: "scheduling", element: withModuleAccess("scheduling", <SchedulingManagementAdmin />) },
      { path: "tasks", element: withModuleAccess("tasks", <AdminAccountantTaskManagement />) },
      { path: "tasks/client-appointments", element: withModuleAccess("tasks", <TaskClientAppointmentsPage />, "client-appointments") },
      { path: "new-services", element: withModuleAccess("tasks", <NewServices />) },
      { path: "reports", element: withModuleAccess("reports", <AdminReports />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
  {
    path: "/secretary",
    roleId: 2,
    component: SecretaryDashboard,
    children: [
      { path: "appointments", element: withModuleAccess("appointments", <AppointmentManagement />) },
      { path: "work-update/history", element: withModuleAccess("work-update", <TasksUpdateHistory />, "history") },
      { path: "scheduling", element: withModuleAccess("scheduling", <SchedulingManagementSecretary />) },
      { path: "clients", element: <Navigate to="/secretary" replace /> },
      { path: "client-management", element: withModuleAccess("client-management", <ClientManagementSecretary />) },
      { path: "new-client-management", element: withModuleAccess("new-client-management", <NewClientManagement />) },
      { path: "documents", element: withModuleAccess("documents", <DocumentAdminPage />) },
      { path: "certificate", element: withModuleAccess("certificate", <CertificatePage />) },
      { path: "certificate/edit", element: withModuleAccess("edit-certificate", <EditCertificate />) },
      { path: "business-status", element: withModuleAccess("business-status", <ClientBusinessStatusPage />) },
      { path: "users", element: withModuleAccess("user-management", <UserManagement />) },
      { path: "tasks", element: withModuleAccess("tasks", <SecretaryTaskManagement />) },
      { path: "tasks/client-appointments", element: withModuleAccess("tasks", <TaskClientAppointmentsPage />, "client-appointments") },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "reports", element: withModuleAccess("reports", <SecretaryReports />) },
      { path: "work-update", element: withModuleAccess("work-update", <WorkUpdate />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
  {
    path: "/accountant",
    roleId: 3,
    component: AccountantDashboard,
    children: [
      { path: "appointments", element: withModuleAccess("appointments", <AppointmentManagement />) },
      { path: "scheduling", element: withModuleAccess("scheduling", <SchedulingManagementSecretary />) },
      { path: "client-management", element: withModuleAccess("client-management", <ClientManagementSecretary />) },
      { path: "new-client-management", element: withModuleAccess("new-client-management", <NewClientManagement />) },
      { path: "documents", element: withModuleAccess("documents", <DocumentAdminPage />) },
      { path: "certificate/edit", element: withModuleAccess("edit-certificate", <EditCertificate />) },
      { path: "certificate", element: withModuleAccess("certificate", <CertificatePage />) },
      { path: "business-status", element: withModuleAccess("business-status", <ClientBusinessStatusPage />) },
      { path: "users", element: withModuleAccess("user-management", <UserManagement />) },
      { path: "permissions", element: withModuleAccess("permissions", <Permissions />) },
      { path: "tasks/client-appointments", element: withModuleAccess("tasks", <TaskClientAppointmentsPage />, "client-appointments") },
      { path: "tasks", element: withModuleAccess("tasks", <SecretaryTaskManagement />) },
      { path: "work-update/history", element: withModuleAccess("work-update", <TasksUpdateHistory />, "history") },
      { path: "work-update", element: withModuleAccess("work-update", <MyTasks />) },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "reports", element: withModuleAccess("reports", <SecretaryReports />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
      {
        path: "my-tasks/history",
        element: withModuleAccess("work-update", <Navigate to="/accountant/work-update/history" replace />, "history"),
      },
      { path: "my-tasks", element: withModuleAccess("work-update", <Navigate to="/accountant/work-update" replace />) },
      { path: "settings", element: withModuleAccess("settings", <AdminSettings />) },
    ],
  },
  {
    path: "/client",
    roleId: 4,
    component: ClientDashboard,
    children: [
      { path: "businesses", element: <BusinessPage /> },
      { path: "appointment", element: <ClientAppointment /> },
      { path: "work-progress", element: <WorkProgress /> },
      { path: "work-progress/history", element: <ClientHistory /> },
      { path: "certificate", element: <ClientCertificatePage /> },
      { path: "documents", element: <ClientDocumentsPage /> },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
];

function createPrivateRoute({ path, roleId, component: LayoutComponent, children }) {
  return {
    path,
    element: <RoleProtectedRoute allowedRoleId={roleId} LayoutComponent={LayoutComponent} />,
    children,
  };
}

export function createAppRouter() {
  return createBrowserRouter([
    ...publicRoutes,
    ...privateRouteGroups.map(createPrivateRoute),
    { path: "*", element: <NotFoundPage /> },
  ]);
}

const router = createAppRouter();

export default router;

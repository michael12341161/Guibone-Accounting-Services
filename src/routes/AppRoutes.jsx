import React from "react";
import { Navigate, createBrowserRouter, useNavigate } from "react-router-dom";
import LandingPage from "../Pages/landing_page/landing_page";
import LoginPage from "../Pages/auth/login";
import SignUpPage from "../Pages/auth/sign_up";
import { getHomePathForRole } from "../context/AuthContext";
import { useAuth } from "../hooks/useAuth";
import AdminDashboard from "../Pages/admin_page/admin_dashboard";
import UserManagement from "../Pages/admin_page/user_management";
import Permissions from "../Pages/admin_page/permission";
import ClientManagement from "../Pages/admin_page/client_management";
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
import ClientManagementSecretary from "../Pages/secretary_page/client_management_secretary";
import SecretaryTaskManagement from "../Pages/secretary_page/task_management_secretary";
import AppointmentManagement from "../Pages/secretary_page/appointment_management";
import SchedulingManagementSecretary from "../Pages/secretary_page/scheduling_management_secretary";
import WorkUpdate from "../Pages/secretary_page/work_update";
import AdminAppointmentManagement from "../Pages/admin_page/client_appointment";
import AdminWorkUpdate from "../Pages/admin_page/accountant_work_update";
import AdminAccountantTaskManagement from "../Pages/admin_page/accountant_task";
import MyTasks from "../Pages/accountant_page/my_tasks";
import MessagingPage from "../Pages/messaging_page/messaging_page";
import Calendar from "../calendar/calendary";
import AdminSettings from "../settings/admin_settings";
import SchedulingManagementAdmin from "../Pages/admin_page/scheduling_management_admin";
import { ModuleAccessGate } from "../components/layout/module_access_gate";

function RoleProtectedRoute({ allowedRoleId, LayoutComponent }) {
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

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

function withModuleAccess(moduleKey, element) {
  return <ModuleAccessGate moduleKey={moduleKey}>{element}</ModuleAccessGate>;
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
      { path: "work-update", element: withModuleAccess("work-update", <AdminWorkUpdate />) },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "settings", element: withModuleAccess("settings", <AdminSettings />) },
      { path: "users", element: withModuleAccess("user-management", <UserManagement />) },
      { path: "permissions", element: withModuleAccess("permissions", <Permissions />) },
      { path: "client-management", element: withModuleAccess("client-management", <ClientManagement />) },
      { path: "documents", element: withModuleAccess("client-management", <DocumentAdminPage />) },
      { path: "business-status", element: withModuleAccess("client-management", <ClientBusinessStatusPage />) },
      { path: "new-client-management", element: withModuleAccess("new-client-management", <NewClientManagement />) },
      { path: "scheduling", element: withModuleAccess("scheduling", <SchedulingManagementAdmin />) },
      { path: "tasks", element: withModuleAccess("tasks", <AdminAccountantTaskManagement />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
  {
    path: "/secretary",
    roleId: 2,
    component: SecretaryDashboard,
    children: [
      { path: "appointments", element: withModuleAccess("appointments", <AppointmentManagement />) },
      { path: "scheduling", element: withModuleAccess("scheduling", <SchedulingManagementSecretary />) },
      { path: "clients", element: <Navigate to="/secretary" replace /> },
      { path: "client-management", element: withModuleAccess("client-management", <ClientManagementSecretary />) },
      { path: "new-client-management", element: withModuleAccess("new-client-management", <NewClientManagement />) },
      { path: "users", element: withModuleAccess("user-management", <UserManagement />) },
      { path: "tasks", element: withModuleAccess("tasks", <SecretaryTaskManagement />) },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "reports", element: withModuleAccess("reports", <div style={{ padding: 20 }}>Reports page</div>) },
      { path: "work-update", element: withModuleAccess("work-update", <WorkUpdate />) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
  {
    path: "/accountant",
    roleId: 3,
    component: AccountantDashboard,
    children: [
      { path: "invoices", element: withModuleAccess("invoices", <div style={{ padding: 20 }}>Invoices page</div>) },
      { path: "reports", element: withModuleAccess("reports", <div style={{ padding: 20 }}>Reports page</div>) },
      { path: "my-tasks", element: withModuleAccess("my-tasks", <MyTasks />) },
      { path: "calendar", element: withModuleAccess("calendar", <Calendar />) },
      { path: "settings", element: withModuleAccess("settings", <div style={{ padding: 20 }}>Settings page</div>) },
      { path: "messaging", element: withModuleAccess("messaging", <MessagingPage />) },
    ],
  },
  {
    path: "/client",
    roleId: 4,
    component: ClientDashboard,
    children: [
      { path: "businesses", element: withModuleAccess("client-account", <BusinessPage />) },
      { path: "appointment", element: withModuleAccess("client-account", <ClientAppointment />) },
      { path: "work-progress", element: withModuleAccess("client-account", <WorkProgress />) },
      { path: "documents", element: withModuleAccess("client-account", <ClientDocumentsPage />) },
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

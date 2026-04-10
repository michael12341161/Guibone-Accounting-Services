import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  FilePenLine,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { getUserDisplayName } from "../components/layout/layout_utils";
import { adminBreadcrumbConfig } from "../config/adminBreadcrumbConfig";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { resolveBackendAssetUrl } from "../services/api";
import { filterNavItemsByAccess } from "../utils/module_permissions";

const sidebarIconProps = {
  className: "h-5 w-5",
  strokeWidth: 1.5,
};

const menuIconProps = {
  className: "h-4 w-4",
  strokeWidth: 1.5,
};

export const adminNavItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/admin",
    icon: <LayoutDashboard {...sidebarIconProps} />,
    accessKey: "dashboard",
  },
  {
    key: "client-management",
    label: "Client List",
    icon: <Users {...sidebarIconProps} />,
    sectionLabel: "Client Management",
    accessKey: "client-management",
    children: [
      {
        key: "client-list",
        label: "Clients",
        to: "/admin/client-management",
        icon: <Users {...sidebarIconProps} />,
        accessKey: "client-management",
      },
      {
        key: "new-client-management",
        label: "New Client",
        to: "/admin/new-client-management",
        icon: <UserPlus {...sidebarIconProps} />,
        accessKey: "new-client-management",
      },
      {
        key: "documents",
        label: "Documents",
        to: "/admin/documents",
        icon: <FileText {...sidebarIconProps} />,
        accessKey: "documents",
      },
      {
        key: "business-status",
        label: "Business Status",
        to: "/admin/business-status",
        icon: <Building2 {...sidebarIconProps} />,
        accessKey: "business-status",
      },
    ],
  },
  {
    key: "certificate-menu",
    label: "Certificate Template",
    icon: <FilePenLine {...sidebarIconProps} />,
    sectionLabel: "Certificate",
    accessKey: "certificate",
    children: [
      {
        key: "certificate-view",
        label: "Certificate",
        to: "/admin/certificate",
        end: true,
        icon: <FileText {...sidebarIconProps} />,
        accessKey: "certificate",
      },
      {
        key: "edit-certificate",
        label: "Edit Certificate",
        to: "/admin/certificate/edit",
        icon: <FilePenLine {...sidebarIconProps} />,
        accessKey: "edit-certificate",
      },
    ],
  },
  {
    key: "appointments",
    label: "Appointments",
    to: "/admin/appointments",
    icon: <CalendarCheck {...sidebarIconProps} />,
    sectionLabel: "Concerns & Services",
    accessKey: "appointments",
  },
  {
    key: "scheduling",
    label: "Consultation",
    to: "/admin/scheduling",
    icon: <CalendarClock {...sidebarIconProps} />,
    accessKey: "scheduling",
  },
  {
    key: "task-management",
    label: "Task Management",
    icon: <ClipboardList {...sidebarIconProps} />,
    sectionLabel: "Workspace",
    accessKey: "tasks",
    children: [
      {
        key: "tasks",
        label: "Tasks",
        to: "/admin/tasks",
        icon: <ClipboardList {...sidebarIconProps} />,
        accessKey: "tasks",
      },
      {
        key: "work-update",
        label: "Task Update",
        to: "/admin/work-update",
        icon: <FilePenLine {...sidebarIconProps} />,
        accessKey: "work-update",
      },
    ],
  },
  {
    key: "messaging",
    label: "Messaging",
    to: "/admin/messaging",
    icon: <MessageCircleMore {...sidebarIconProps} />,
    sectionLabel: "Communication",
    accessKey: "messaging",
  },
  {
    key: "calendar",
    label: "Calendar",
    to: "/admin/calendar",
    icon: <CalendarDays {...sidebarIconProps} />,
    sectionLabel: "Event Calendar",
    accessKey: "calendar",
  },
  {
    key: "reports",
    label: "Reports",
    to: "/admin/reports",
    icon: <BarChart3 {...sidebarIconProps} />,
    sectionLabel: "Insights",
    accessKey: "reports",
  },
  {
    key: "user-management",
    label: "User Management",
    icon: <UserCog {...sidebarIconProps} />,
    sectionLabel: "System Users",
    accessKey: "user-management",
    children: [
      {
        key: "users",
        label: "Users",
        to: "/admin/users",
        icon: <Users {...sidebarIconProps} />,
        accessKey: "user-management",
      },
      {
        key: "permissions",
        label: "Permissions",
        to: "/admin/permissions",
        icon: <ShieldCheck {...sidebarIconProps} />,
        accessKey: "permissions",
      },
    ],
  },
];

export default function AdminLayout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const { permissions } = useModulePermissions();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const adminEmail = useMemo(() => user?.email || user?.username || "", [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = filterNavItemsByAccess(user, adminNavItems, permissions);

  return (
    <DashboardShell
      navItems={visibleNavItems}
      navbarProps={{
        logoSrc: appLogo,
        logoAlt: "Guibone Accounting Services",
        title: "Guibone Accounting Services",
        userName: displayName,
        profileDisplayName: displayName,
        avatarSrc,
        rightContent: <LayoutHeaderActions />,
        profileItems: [
          {
            key: "settings",
            label: "Settings",
            onClick: () => navigate("/admin/settings"),
            icon: <Settings {...menuIconProps} />,
          },
          {
            key: "logout",
            label: "Log Out",
            tone: "danger",
            onClick: onLogout,
            icon: <LogOut {...menuIconProps} />,
            separatorBefore: true,
          },
        ],
      }}
      sidebarProps={{
        headerVariant: "card",
        profileName: "",
        profileTitle: "Administrator",
        profileMeta: adminEmail,
        profileAvatarSrc: avatarSrc,
        showProfileAvatar: false,
        profilePlacement: "bottom",
      }}
      footerProps={{ subtitle: "Admin workspace" }}
      desktopSidebarCollapsible
      desktopSidebarCollapseMode="icons"
    >
      <>
        <RouteBreadcrumbs config={adminBreadcrumbConfig} />
        {children}
      </>
    </DashboardShell>
  );
}

import React, { useMemo, useState } from "react";
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
  ListTodo,
  PlusSquare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import { adminBreadcrumbConfig } from "../config/adminBreadcrumbConfig";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import { usePendingTaskAttentionCount } from "../hooks/usePendingTaskAttentionCount";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import AdminProfile from "../Pages/profile/AdminProfile";
import { resolveBackendAssetUrl } from "../services/api";
import { filterNavItemsByAccess } from "../utils/module_permissions";
import { buildPendingTaskAttentionMessage } from "../utils/task_attention";

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
    key: "payment",
    label: "Payment",
    to: "/admin/payment",
    icon: <ReceiptText {...sidebarIconProps} />,
    sectionLabel: "Billing",
    badgeLabel: "Receipts",
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
        label: "My Tasks",
        to: "/admin/work-update",
        icon: <ListTodo {...sidebarIconProps} />,
        accessKey: "work-update",
      },
      {
        key: "new-services",
        label: "New Services",
        to: "/admin/new-services",
        icon: <PlusSquare {...sidebarIconProps} />,
        accessKey: "tasks",
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
      {
        key: "new-specialization",
        label: "New Specialization",
        to: "/admin/new-specialization",
        icon: <PlusSquare {...sidebarIconProps} />,
        accessKey: "user-management",
      },
      {
        key: "new-role",
        label: "New Role",
        to: "/admin/new-role",
        icon: <PlusSquare {...sidebarIconProps} />,
        accessKey: "user-management",
      },
    ],
  },
];

export default function AdminLayout({ user, onLogout, children }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const pendingTaskAttentionCount = usePendingTaskAttentionCount();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const passwordExpiryLabel = useMemo(() => getProfileMenuExpiryLabel(user), [user]);
  const adminEmail = useMemo(() => user?.email || user?.username || "", [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = useMemo(() => {
    const filteredItems = filterNavItemsByAccess(user, adminNavItems, permissions);
    if (pendingTaskAttentionCount <= 0) {
      return filteredItems;
    }

    const helperText = buildPendingTaskAttentionMessage(pendingTaskAttentionCount);
    return filteredItems.map((item) =>
      item?.key === "task-management"
        ? {
            ...item,
            badgeCount: pendingTaskAttentionCount,
            helperText,
          }
        : item
    );
  }, [permissions, pendingTaskAttentionCount, user]);
  const profileItems = useMemo(() => {
    const items = [
      {
        key: "change-password",
        label: "Change Password",
        onClick: () => setChangePasswordOpen(true),
        icon: <KeyRound {...menuIconProps} />,
        badgeLabel: passwordExpiryLabel || undefined,
      },
      {
        key: "profile",
        label: "Profile",
        onClick: () => setProfileOpen(true),
        icon: <UserRound {...menuIconProps} />,
      },
      {
        key: "settings",
        label: "Settings",
        onClick: () => navigate("/admin/settings"),
        icon: <Settings {...menuIconProps} />,
      },
    ];

    if (onLogout) {
      items.push({
        key: "logout",
        label: "Log Out",
        tone: "danger",
        onClick: onLogout,
        icon: <LogOut {...menuIconProps} />,
        separatorBefore: true,
      });
    }

    return items;
  }, [navigate, onLogout, passwordExpiryLabel]);

  const handleProfileUpdated = (nextProfile) => {
    if (!nextProfile || typeof nextProfile !== "object") return;

    login({
      ...user,
      ...nextProfile,
      username: nextProfile.username ?? nextProfile.email ?? user?.username ?? null,
      email: nextProfile.email ?? user?.email ?? null,
      first_name:
        nextProfile.first_name ?? nextProfile.employee_first_name ?? user?.first_name ?? user?.employee_first_name ?? null,
      middle_name:
        nextProfile.middle_name ??
        nextProfile.employee_middle_name ??
        user?.middle_name ??
        user?.employee_middle_name ??
        null,
      last_name: nextProfile.last_name ?? nextProfile.employee_last_name ?? user?.last_name ?? user?.employee_last_name ?? null,
      profile_image: nextProfile.profile_image ?? nextProfile.Profile_Image ?? user?.profile_image ?? null,
    });
  };

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
        onLogout,
        profileItems,
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
      <AdminProfile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        onProfileUpdated={handleProfileUpdated}
      />
      <ForgotPasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        defaultEmail={user?.email || ""}
        passwordExpiryDaysOverride={user?.security_settings?.passwordExpiryDays ?? null}
        securitySettingsOverride={user?.security_settings ?? null}
      />
    </DashboardShell>
  );
}

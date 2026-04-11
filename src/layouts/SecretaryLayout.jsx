import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FilePenLine,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  UserCog,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { secretaryBreadcrumbConfig } from "../config/secretaryBreadcrumbConfig";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import { usePendingTaskAttentionCount } from "../hooks/usePendingTaskAttentionCount";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import SecretaryProfile from "../Pages/profile/SecretaryProfile";
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

export const secretaryNavItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/secretary",
    icon: <LayoutDashboard {...sidebarIconProps} />,
    accessKey: "dashboard",
  },
  {
    key: "client-management",
    label: "Client Management",
    icon: <Users {...sidebarIconProps} />,
    sectionLabel: "Client Management",
    accessKey: "client-management",
    children: [
      {
        key: "client-list",
        label: "Clients",
        to: "/secretary/client-management",
        icon: <Users {...sidebarIconProps} />,
        accessKey: "client-management",
      },
      {
        key: "new-client-management",
        label: "New Client",
        to: "/secretary/new-client-management",
        icon: <UserPlus {...sidebarIconProps} />,
        accessKey: "new-client-management",
      },
      {
        key: "documents",
        label: "Documents",
        to: "/secretary/documents",
        icon: <FileText {...sidebarIconProps} />,
        accessKey: "documents",
      },
      {
        key: "business-status",
        label: "Business Status",
        to: "/secretary/business-status",
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
        to: "/secretary/certificate",
        end: true,
        icon: <FileText {...sidebarIconProps} />,
        accessKey: "certificate",
      },
      {
        key: "edit-certificate",
        label: "Edit Certificate",
        to: "/secretary/certificate/edit",
        icon: <FilePenLine {...sidebarIconProps} />,
        accessKey: "edit-certificate",
      },
    ],
  },
  {
    key: "appointments",
    label: "Appointments",
    to: "/secretary/appointments",
    icon: <CalendarCheck {...sidebarIconProps} />,
    sectionLabel: "Concerns & Services",
    accessKey: "appointments",
  },
  {
    key: "scheduling",
    label: "Consultation",
    to: "/secretary/scheduling",
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
        to: "/secretary/tasks",
        icon: <ClipboardList {...sidebarIconProps} />,
        accessKey: "tasks",
      },
      {
        key: "work-update",
        label: "Task Update",
        to: "/secretary/work-update",
        icon: <FilePenLine {...sidebarIconProps} />,
        accessKey: "work-update",
      },
    ],
  },
  {
    key: "messaging",
    label: "Messaging",
    to: "/secretary/messaging",
    icon: <MessageCircleMore {...sidebarIconProps} />,
    sectionLabel: "Communication",
    accessKey: "messaging",
  },
  {
    key: "calendar",
    label: "Calendar",
    to: "/secretary/calendar",
    icon: <CalendarDays {...sidebarIconProps} />,
    sectionLabel: "Event Calendar",
    accessKey: "calendar",
  },
  {
    key: "reports",
    label: "Reports",
    to: "/secretary/reports",
    icon: <BarChart3 {...sidebarIconProps} />,
    sectionLabel: "Insights",
    accessKey: "reports",
  },
  {
    key: "user-management",
    label: "User Management",
    to: "/secretary/users",
    icon: <UserCog {...sidebarIconProps} />,
    sectionLabel: "System Users",
    accessKey: "user-management",
  },
];

export default function SecretaryLayout({ user, onLogout, children }) {
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const pendingTaskAttentionCount = usePendingTaskAttentionCount();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const passwordExpiryLabel = useMemo(() => getProfileMenuExpiryLabel(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = useMemo(() => {
    const filteredItems = filterNavItemsByAccess(user, secretaryNavItems, permissions);
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
  }, [onLogout, passwordExpiryLabel]);

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
      last_name:
        nextProfile.last_name ?? nextProfile.employee_last_name ?? user?.last_name ?? user?.employee_last_name ?? null,
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
        profileTitle: "Secretary",
        profileMeta: user?.email || user?.username || "",
        profileAvatarSrc: avatarSrc,
        showProfileAvatar: false,
        profilePlacement: "bottom",
      }}
      footerProps={{ title: null, subtitle: "Secretary workspace" }}
      desktopSidebarCollapsible
      desktopSidebarCollapseMode="icons"
    >
      <>
        <RouteBreadcrumbs config={secretaryBreadcrumbConfig} />
        {children}
      </>
      <SecretaryProfile
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

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
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getUserFirstName } from "../components/layout/layout_utils";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import SecretaryProfile from "../Pages/profile/SecretaryProfile";
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
    key: "user-management",
    label: "User Management",
    to: "/secretary/users",
    icon: <UserCog {...sidebarIconProps} />,
    sectionLabel: "System Users",
    accessKey: "user-management",
  },
  {
    key: "reports",
    label: "Reports",
    to: "/secretary/reports",
    icon: <BarChart3 {...sidebarIconProps} />,
    accessKey: "reports",
  },
];

export default function SecretaryLayout({ user, onLogout, children }) {
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const firstName = useMemo(() => getUserFirstName(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = filterNavItemsByAccess(user, secretaryNavItems, permissions);
  const profileItems = useMemo(() => {
    const items = [
      {
        key: "profile",
        label: "Profile",
        onClick: () => setProfileOpen(true),
        icon: <UserCog {...menuIconProps} />,
      },
    ];

    if (onLogout) {
      items.push({
        key: "logout",
        label: "Logout",
        tone: "danger",
        onClick: onLogout,
        icon: <LogOut {...menuIconProps} />,
      });
    }

    return items;
  }, [onLogout]);

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
        userName: firstName,
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
      {children}
      <SecretaryProfile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        onProfileUpdated={handleProfileUpdated}
      />
    </DashboardShell>
  );
}

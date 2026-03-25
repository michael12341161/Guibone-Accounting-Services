import React, { useMemo, useState } from "react";
import { CalendarDays, LayoutDashboard, ListTodo, LogOut, MessageCircleMore, Settings, UserRound } from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getUserFirstName } from "../components/layout/layout_utils";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import AccountantProfile from "../Pages/profile/AccountantProfile";
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

export const accountantNavItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/accountant",
    icon: <LayoutDashboard {...sidebarIconProps} />,
    accessKey: "dashboard",
  },
  {
    key: "my-tasks",
    label: "My Tasks",
    to: "/accountant/my-tasks",
    icon: <ListTodo {...sidebarIconProps} />,
    sectionLabel: "Workspace",
    accessKey: "my-tasks",
  },
  {
    key: "calendar",
    label: "Calendar",
    to: "/accountant/calendar",
    icon: <CalendarDays {...sidebarIconProps} />,
    sectionLabel: "Event Calendar",
    accessKey: "calendar",
  },
  {
    key: "messaging",
    label: "Messaging",
    to: "/accountant/messaging",
    icon: <MessageCircleMore {...sidebarIconProps} />,
    sectionLabel: "Communication",
    accessKey: "messaging",
  },
  {
    key: "settings",
    label: "Settings",
    to: "/accountant/settings",
    icon: <Settings {...sidebarIconProps} />,
    accessKey: "settings",
  },
];

export default function AccountantLayout({ user, onLogout, children }) {
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const firstName = useMemo(() => getUserFirstName(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = filterNavItemsByAccess(user, accountantNavItems, permissions);
  const profileItems = useMemo(() => {
    const items = [
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
      username: nextProfile.username ?? user?.username ?? null,
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
      profile_image: nextProfile.profile_image ?? user?.profile_image ?? null,
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
        profileTitle: "Accountant",
        profileMeta: user?.email || user?.username || "",
        profileAvatarSrc: avatarSrc,
        showProfileAvatar: false,
        profilePlacement: "bottom",
      }}
      footerProps={{ subtitle: "Accountant workspace" }}
      desktopSidebarCollapsible
      desktopSidebarCollapseMode="icons"
    >
      {children}
      <AccountantProfile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        onProfileUpdated={handleProfileUpdated}
      />
    </DashboardShell>
  );
}

import React, { useMemo, useState } from "react";
import { CalendarDays, KeyRound, LayoutDashboard, ListTodo, LogOut, MessageCircleMore, Settings, UserRound } from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { accountantBreadcrumbConfig } from "../config/accountantBreadcrumbConfig";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import { usePendingTaskAttentionCount } from "../hooks/usePendingTaskAttentionCount";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import AccountantProfile from "../Pages/profile/AccountantProfile";
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
    accessKey: "work-update",
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
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const pendingTaskAttentionCount = usePendingTaskAttentionCount();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const passwordExpiryLabel = useMemo(() => getProfileMenuExpiryLabel(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = useMemo(() => {
    const filteredItems = filterNavItemsByAccess(user, accountantNavItems, permissions);
    if (pendingTaskAttentionCount <= 0) {
      return filteredItems;
    }

    const helperText = buildPendingTaskAttentionMessage(pendingTaskAttentionCount);
    return filteredItems.map((item) =>
      item?.key === "my-tasks"
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
      <>
        <RouteBreadcrumbs config={accountantBreadcrumbConfig} />
        {children}
      </>
      <AccountantProfile
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

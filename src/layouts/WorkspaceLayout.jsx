import React, { useMemo, useState } from "react";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { createWorkspaceBreadcrumbConfig } from "../config/workspaceBreadcrumbConfig";
import { getHomePathForRole } from "../context/AuthContext";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import { usePendingTaskAttentionCount } from "../hooks/usePendingTaskAttentionCount";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import WorkspaceProfile from "../Pages/profile/WorkspaceProfile";
import { resolveBackendAssetUrl } from "../services/api";
import { ROLE_IDS } from "../utils/helpers";
import { filterNavItemsByAccess } from "../utils/module_permissions";
import { buildPendingTaskAttentionMessage } from "../utils/task_attention";
import { adminNavItems } from "./AdminLayout";

const menuIconProps = {
  className: "h-4 w-4",
  strokeWidth: 1.5,
};

function remapAdminPath(value, basePath = "/workspace") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return value;
  }

  return normalized.startsWith("/admin") ? normalized.replace(/^\/admin/, basePath) : normalized;
}

function cloneWorkspaceNavItem(item, basePath = "/workspace") {
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    ...item,
    to: item.to ? remapAdminPath(item.to, basePath) : item.to,
    children: Array.isArray(item.children)
      ? item.children.map((child) => cloneWorkspaceNavItem(child, basePath))
      : item.children,
  };
}

export function buildWorkspaceNavItems(basePath = "/workspace") {
  return adminNavItems.map((item) => cloneWorkspaceNavItem(item, basePath));
}

function resolveWorkspaceRoleLabel(user) {
  const directLabel = String(user?.role || user?.role_name || user?.Role_name || "").trim();
  if (directLabel) {
    return directLabel;
  }

  const roleId = Number(user?.role_id ?? user?.Role_id ?? user?.roleId ?? 0);
  if (roleId === ROLE_IDS.ADMIN) {
    return "Admin";
  }
  if (roleId === ROLE_IDS.SECRETARY) {
    return "Secretary";
  }
  if (roleId === ROLE_IDS.ACCOUNTANT) {
    return "Accountant";
  }
  if (roleId === ROLE_IDS.CLIENT) {
    return "Client";
  }

  return "Assigned Role";
}

export default function WorkspaceLayout({ user, onLogout, children }) {
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const pendingTaskAttentionCount = usePendingTaskAttentionCount();
  const homePath = useMemo(() => getHomePathForRole(user), [user]);
  const workspaceNavItems = useMemo(() => buildWorkspaceNavItems(homePath), [homePath]);
  const workspaceBreadcrumbConfig = useMemo(() => createWorkspaceBreadcrumbConfig(homePath), [homePath]);
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const roleLabel = useMemo(() => resolveWorkspaceRoleLabel(user), [user]);
  const passwordExpiryLabel = useMemo(() => getProfileMenuExpiryLabel(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = useMemo(() => {
    const filteredItems = filterNavItemsByAccess(user, workspaceNavItems, permissions);
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
  }, [permissions, pendingTaskAttentionCount, user, workspaceNavItems]);

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
        profileTitle: roleLabel,
        profileMeta: user?.email || user?.username || "",
        profileAvatarSrc: avatarSrc,
        showProfileAvatar: false,
        profilePlacement: "bottom",
      }}
      footerProps={{ subtitle: "Custom role workspace" }}
      desktopSidebarCollapsible
      desktopSidebarCollapseMode="icons"
    >
      <>
        <RouteBreadcrumbs config={workspaceBreadcrumbConfig} />
        {children}
      </>
      <WorkspaceProfile
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

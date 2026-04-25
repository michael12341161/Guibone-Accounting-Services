import React, { useMemo, useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { appLogo } from "../assets/branding";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { workspaceBreadcrumbConfig } from "../config/workspaceBreadcrumbConfig";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { usePendingTaskAttentionCount } from "../hooks/usePendingTaskAttentionCount";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import { resolveBackendAssetUrl } from "../services/api";
import { filterNavItemsByAccess } from "../utils/module_permissions";
import { buildPendingTaskAttentionMessage } from "../utils/task_attention";
import { adminNavItems } from "./AdminLayout";

const menuIconProps = {
  className: "h-4 w-4",
  strokeWidth: 1.5,
};

function remapAdminPath(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return value;
  }

  return normalized.startsWith("/admin") ? normalized.replace(/^\/admin/, "/workspace") : normalized;
}

function cloneWorkspaceNavItem(item) {
  if (!item || typeof item !== "object") {
    return item;
  }

  return {
    ...item,
    to: item.to ? remapAdminPath(item.to) : item.to,
    children: Array.isArray(item.children) ? item.children.map(cloneWorkspaceNavItem) : item.children,
  };
}

export const workspaceNavItems = adminNavItems.map(cloneWorkspaceNavItem);

export default function WorkspaceLayout({ user, onLogout, children }) {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const pendingTaskAttentionCount = usePendingTaskAttentionCount();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
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
        profileTitle: "Assigned Role",
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

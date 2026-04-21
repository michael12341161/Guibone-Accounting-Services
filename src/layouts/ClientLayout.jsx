import React, { useMemo, useState } from "react";
import { Award, Building2, CalendarCheck, CalendarDays, FileText, KeyRound, LayoutDashboard, ListChecks, LogOut, MessageCircleMore, UserRound } from "lucide-react";
import { appLogo } from "../assets/branding";
import { Button } from "../components/UI/buttons";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getProfileMenuExpiryLabel, getUserDisplayName } from "../components/layout/layout_utils";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { clientBreadcrumbConfig } from "../config/clientBreadcrumbConfig";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import ForgotPasswordModal from "../Pages/auth/forgot_password";
import ClientProfile from "../Pages/profile/clientProfile";
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

export const clientNavItems = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/client",
    icon: <LayoutDashboard {...sidebarIconProps} />,
    accessKey: "dashboard",
  },
  {
    key: "business-details",
    label: "Business Details",
    sectionLabel: "Business management",
    icon: <Building2 {...sidebarIconProps} />,
    children: [
      {
        key: "business",
        label: "Business",
        to: "/client/businesses",
        icon: <Building2 {...sidebarIconProps} />,
      },
      {
        key: "document",
        label: "Document",
        to: "/client/documents",
        icon: <FileText {...sidebarIconProps} />,
      },
    ],
  },
  {
    key: "appointments",
    label: "Appointment",
    to: "/client/appointment",
    icon: <CalendarCheck {...sidebarIconProps} />,
    sectionLabel: "Concerns & Services",
  },
  {
    key: "work_progress",
    label: "My services progress",
    to: "/client/work-progress",
    icon: <ListChecks {...sidebarIconProps} />,
    sectionLabel: "Work Progress",
  },
  {
    key: "certificate",
    label: "Certificate",
    to: "/client/certificate",
    icon: <Award {...sidebarIconProps} />,
    sectionLabel: "My Certificate",
  },
  {
    key: "calendar",
    label: "Calendar",
    to: "/client/calendar",
    icon: <CalendarDays {...sidebarIconProps} />,
    sectionLabel: "Event Calendar",
    accessKey: "calendar",
  },
  {
    key: "messaging",
    label: "Messaging",
    to: "/client/messaging",
    icon: <MessageCircleMore {...sidebarIconProps} />,
    sectionLabel: "Communication",
    accessKey: "messaging",
  },
];

export default function ClientLayout({ user, onLogout, children }) {
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const passwordExpiryLabel = useMemo(() => getProfileMenuExpiryLabel(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = filterNavItemsByAccess(user, clientNavItems, permissions);

  const profileItems = [
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
    ...(onLogout
      ? [
          {
            key: "logout",
            label: "Log Out",
            tone: "danger",
            onClick: onLogout,
            icon: <LogOut {...menuIconProps} />,
            separatorBefore: true,
          },
        ]
      : []),
  ];

  const handleProfileUpdated = (nextProfile) => {
    if (!nextProfile || typeof nextProfile !== "object") return;

    login({
      ...user,
      ...nextProfile,
      username: nextProfile.username ?? nextProfile.email ?? user?.username ?? null,
      email: nextProfile.email ?? user?.email ?? null,
      first_name: nextProfile.first_name ?? user?.first_name ?? null,
      middle_name: nextProfile.middle_name ?? user?.middle_name ?? null,
      last_name: nextProfile.last_name ?? user?.last_name ?? null,
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
        profileTitle: "Client",
        profileMeta: user?.email || user?.username || "",
        profileAvatarSrc: avatarSrc,
        showProfileAvatar: false,
        profilePlacement: "bottom",
      }}
      footerProps={{ subtitle: "Client workspace" }}
      desktopSidebarCollapsible
      desktopSidebarCollapseMode="icons"
    >
      <>
        <RouteBreadcrumbs config={clientBreadcrumbConfig} />
        {children}
      </>
      <ClientProfile
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

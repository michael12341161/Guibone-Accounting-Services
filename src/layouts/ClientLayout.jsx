import React, { useMemo, useState } from "react";
import { Award, Building2, CalendarCheck, FileText, LayoutDashboard, ListChecks, LogOut, MessageCircleMore, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { appLogo } from "../assets/branding";
import { Button } from "../components/UI/buttons";
import { DashboardShell } from "../components/layout/dashboard_shell";
import { LayoutHeaderActions } from "../components/layout/layout_header_actions";
import { getUserFirstName } from "../components/layout/layout_utils";
import RouteBreadcrumbs from "../components/navigation/RouteBreadcrumbs";
import { clientBreadcrumbConfig } from "../config/clientBreadcrumbConfig";
import { getHomePathForRole } from "../context/AuthContext";
import { useModulePermissions } from "../context/ModulePermissionsContext";
import { useAuth } from "../hooks/useAuth";
import ClientProfile from "../Pages/profile/clientProfile";
import { resolveBackendAssetUrl, restoreOriginalAccount } from "../services/api";
import { showErrorToast } from "../utils/feedback";
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
    accessKey: "client-account",
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
        accessKey: "client-account",
      },
      {
        key: "document",
        label: "Document",
        to: "/client/documents",
        icon: <FileText {...sidebarIconProps} />,
        accessKey: "client-account",
      },
    ],
  },
  {
    key: "appointments",
    label: "Appointment",
    to: "/client/appointment",
    icon: <CalendarCheck {...sidebarIconProps} />,
    sectionLabel: "Concerns & Services",
    accessKey: "client-account",
  },
  {
    key: "work_progress",
    label: "My services progress",
    to: "/client/work-progress",
    icon: <ListChecks {...sidebarIconProps} />,
    sectionLabel: "Work Progress",
    accessKey: "client-account",
  },
  {
    key: "certificate",
    label: "Certificate",
    to: "/client/certificate",
    icon: <Award {...sidebarIconProps} />,
    sectionLabel: "My Certificate",
    accessKey: "client-account",
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
  const navigate = useNavigate();
  const { login } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const { permissions } = useModulePermissions();
  const firstName = useMemo(() => getUserFirstName(user), [user]);
  const avatarSrc = useMemo(() => resolveBackendAssetUrl(user?.profile_image), [user]);
  const visibleNavItems = filterNavItemsByAccess(user, clientNavItems, permissions);
  const impersonationRoleId = Number(user?.impersonation?.original_user?.role_id ?? 0);
  const isImpersonatingStaff = impersonationRoleId === 1 || impersonationRoleId === 2;
  const returnLabel = impersonationRoleId === 2 ? "Return to Secretary" : "Return to Admin";

  const handleReturnToAdmin = async () => {
    try {
      const response = await restoreOriginalAccount();
      const nextUser = response?.data?.user;
      if (!nextUser) {
        throw new Error(response?.data?.message || "Unable to return to the original account.");
      }

      login(nextUser);
      navigate(getHomePathForRole(nextUser?.role_id), { replace: true });
    } catch (error) {
      showErrorToast(error?.response?.data?.message || error?.message || "Unable to return to the original account.");
    }
  };

  const profileItems = [
    {
      key: "profile",
      label: "Profile",
      onClick: () => setProfileOpen(true),
      icon: <UserRound {...menuIconProps} />,
    },
    ...(isImpersonatingStaff
      ? [
          {
            key: "return-to-admin",
            label: returnLabel,
            onClick: () => {
              void handleReturnToAdmin();
            },
          },
        ]
      : []),
    ...(onLogout
      ? [
          {
            key: "logout",
            label: "Logout",
            tone: "danger",
            onClick: onLogout,
            icon: <LogOut {...menuIconProps} />,
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
        userName: firstName,
        avatarSrc,
        rightContent: (
          <>
            {isImpersonatingStaff ? (
              <Button
                size="sm"
                className="bg-amber-500 text-white hover:bg-amber-600"
                onClick={() => {
                  void handleReturnToAdmin();
                }}
              >
                {returnLabel}
              </Button>
            ) : null}
            <LayoutHeaderActions />
          </>
        ),
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
        {isImpersonatingStaff ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You are viewing this client account in read-only mode. All client actions are disabled for staff access.
          </div>
        ) : null}
        <fieldset
          disabled={isImpersonatingStaff}
          aria-readonly={isImpersonatingStaff}
          className="m-0 min-w-0 border-0 p-0"
        >
          {children}
        </fieldset>
      </>
      <ClientProfile
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        readOnly={isImpersonatingStaff}
        onProfileUpdated={handleProfileUpdated}
      />
    </DashboardShell>
  );
}

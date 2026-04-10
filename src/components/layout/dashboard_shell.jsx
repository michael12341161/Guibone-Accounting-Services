import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Navbar } from "../navigation/navbar";
import { Sidebar } from "../navigation/sidebar";
import { LayoutFooter } from "./layout_footer";
import { RouteLoadingPanel } from "./route_loading_panel";
import { RouteLoadingContext } from "./route_loading_context";
import { normalizePath } from "./layout_utils";
import { useAuth } from "../../hooks/useAuth";
import { LOGIN_SESSION_STORAGE_KEY } from "../../context/AuthContext";
import { showAlertDialog } from "../../utils/feedback";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

const PASSWORD_EXPIRY_DASHBOARD_WARNING_STORAGE_KEY = "monitoring:password-expiry-dashboard-warning";

function getManilaDateKey() {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value || "0000";
    const month = parts.find((part) => part.type === "month")?.value || "00";
    const day = parts.find((part) => part.type === "day")?.value || "00";
    return `${year}-${month}-${day}`;
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildPasswordExpiryWarningMessage(remainingDays) {
  const normalizedDays = Math.max(1, Math.trunc(remainingDays));
  return `\u26A0\uFE0F Your password will expire in ${normalizedDays} day${
    normalizedDays === 1 ? "" : "s"
  }. Please update it to maintain access to your account.`;
}

export function DashboardShell({
  navItems,
  navbarProps,
  sidebarProps,
  footerProps,
  children,
  rootClassName = "min-h-screen bg-slate-50",
  mainClassName = "pt-16",
  contentClassName = "mx-auto max-w-7xl p-6",
  showFooter = true,
  desktopSidebarCollapsible = false,
  desktopSidebarDefaultOpen = true,
  desktopSidebarCollapseMode = "hidden",
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(
    desktopSidebarCollapsible ? desktopSidebarDefaultOpen : true
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [manilaDateKey, setManilaDateKey] = useState(() => getManilaDateKey());
  const loadingToRef = useRef(null);
  const location = useLocation();
  const { user } = useAuth();
  const homePath = useMemo(() => normalizePath(navItems?.[0]?.to || "/"), [navItems]);
  const showCollapsedDesktopSidebar = desktopSidebarCollapsible && !desktopSidebarOpen && desktopSidebarCollapseMode === "icons";
  const desktopSidebarVisible = !desktopSidebarCollapsible || desktopSidebarOpen || showCollapsedDesktopSidebar;

  const toggleSidebar = () => {
    if (desktopSidebarCollapsible && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setDesktopSidebarOpen((open) => !open);
      return;
    }

    setMobileSidebarOpen((open) => !open);
  };

  const startRouteLoading = () => {
    setRouteLoading(true);

    window.clearTimeout(loadingToRef.current);
    loadingToRef.current = window.setTimeout(() => {
      setRouteLoading(false);
    }, 8000);
  };

  useEffect(() => {
    if (!routeLoading) return undefined;

    const raf = window.requestAnimationFrame(() => {
      window.clearTimeout(loadingToRef.current);
      loadingToRef.current = window.setTimeout(() => {
        setRouteLoading(false);
      }, 180);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [location.key, routeLoading]);

  useEffect(() => () => window.clearTimeout(loadingToRef.current), []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateDateKey = () => {
      setManilaDateKey((previousValue) => {
        const nextValue = getManilaDateKey();
        return previousValue === nextValue ? previousValue : nextValue;
      });
    };

    updateDateKey();
    const intervalId = window.setInterval(updateDateKey, 60 * 1000);
    window.addEventListener("focus", updateDateKey);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", updateDateKey);
    };
  }, []);

  useEffect(() => {
    const currentPath = normalizePath(location.pathname);
    if (currentPath !== homePath) {
      return;
    }

    const remainingDays = Number(user?.password_days_until_expiry);
    const normalizedRemainingDays = Math.trunc(remainingDays);
    if (
      !Number.isFinite(remainingDays) ||
      normalizedRemainingDays <= 0 ||
      normalizedRemainingDays > 15
    ) {
      return;
    }

    try {
      const userId = String(user?.id ?? user?.user_id ?? user?.User_ID ?? "").trim();
      const passwordChangedAt = String(user?.password_changed_at || "").trim();
      const loginSessionKey =
        String(sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY) || "").trim() || "restored";
      if (!userId) {
        return;
      }

      const shownKey = `${userId}:${passwordChangedAt}:${manilaDateKey}:${loginSessionKey}`;
      const previousShownKey = String(
        localStorage.getItem(PASSWORD_EXPIRY_DASHBOARD_WARNING_STORAGE_KEY) || ""
      ).trim();
      if (previousShownKey === shownKey) {
        return;
      }

      localStorage.setItem(PASSWORD_EXPIRY_DASHBOARD_WARNING_STORAGE_KEY, shownKey);
      void showAlertDialog({
        icon: "warning",
        title: "Password Expiry Notice",
        html: `<div style="padding:8px 0;line-height:1.65;color:inherit;">${buildPasswordExpiryWarningMessage(
          normalizedRemainingDays
        )}</div>`,
        confirmButtonText: "OK",
      });
    } catch (_) {}
  }, [homePath, location.pathname, manilaDateKey, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncSidebarState = (event) => {
      if (event.matches) {
        setMobileSidebarOpen(false);
      }
    };

    syncSidebarState(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncSidebarState);
      return () => mediaQuery.removeEventListener("change", syncSidebarState);
    }

    mediaQuery.addListener(syncSidebarState);
    return () => mediaQuery.removeListener(syncSidebarState);
  }, []);

  const onSidebarItemClick = (item, event, { currentPath }) => {
    const targetPath = normalizePath(item?.to);
    const nextPath = normalizePath(currentPath);
    const isSameRoute = nextPath === targetPath || (targetPath === homePath && nextPath === homePath);

    if (isSameRoute) return;

    if (routeLoading) {
      event.preventDefault();
      return;
    }

    startRouteLoading();
    setMobileSidebarOpen(false);
  };

  const resolvedNavbarProps = {
    ...navbarProps,
    onToggleSidebar: toggleSidebar,
    showSidebarToggle: navbarProps?.showSidebarToggle ?? true,
    showSidebarToggleOnDesktop:
      navbarProps?.showSidebarToggleOnDesktop ??
      (desktopSidebarCollapsible && !desktopSidebarOpen && !showCollapsedDesktopSidebar),
  };

  const resolvedSidebarProps = desktopSidebarCollapsible
    ? {
        ...sidebarProps,
        headerAction: {
          ...(sidebarProps?.headerAction || {}),
          onClick: toggleSidebar,
          label: sidebarProps?.headerAction?.label || "Toggle sidebar",
        },
      }
    : sidebarProps;
  const desktopSidebarProps = desktopSidebarCollapsible
    ? {
        ...resolvedSidebarProps,
        collapsed: showCollapsedDesktopSidebar,
        onExpandFromCollapsed: showCollapsedDesktopSidebar ? () => setDesktopSidebarOpen(true) : undefined,
      }
    : resolvedSidebarProps;

  return (
    <RouteLoadingContext.Provider value={{ routeLoading, startRouteLoading }}>
      <div className={rootClassName}>
        <Navbar {...resolvedNavbarProps} />

        {desktopSidebarVisible ? (
          <aside
            className={classNames(
              "z-20 hidden lg:fixed lg:inset-y-0 lg:flex lg:pt-16",
              showCollapsedDesktopSidebar ? "lg:w-20" : "lg:w-64"
            )}
          >
            <Sidebar
              items={navItems}
              routeLoading={routeLoading}
              onItemClick={onSidebarItemClick}
              {...desktopSidebarProps}
            />
          </aside>
        ) : null}

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileSidebarOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-64 pt-16 shadow-xl">
              <Sidebar
                items={navItems}
                routeLoading={routeLoading}
                onItemClick={onSidebarItemClick}
                {...resolvedSidebarProps}
              />
            </div>
          </div>
        )}

        <main
          className={classNames(
            mainClassName,
            desktopSidebarVisible ? (showCollapsedDesktopSidebar ? "lg:ml-20" : "lg:ml-64") : "lg:ml-0"
          )}
        >
          <div className={contentClassName}>
            {routeLoading ? <RouteLoadingPanel /> : null}

            <div
              className={
                routeLoading
                  ? "pointer-events-none h-0 overflow-hidden opacity-0"
                  : "opacity-100 transition-opacity duration-150"
              }
            >
              {children}
            </div>
          </div>

          {showFooter ? <LayoutFooter {...footerProps} /> : null}
        </main>
      </div>
    </RouteLoadingContext.Provider>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { findMatchingNavItem } from "../layout/layout_utils";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function getMatchingGroupKeys(items, pathname) {
  const matchedGroups = new Set();

  (items || []).forEach((item) => {
    if (!item?.children?.length || !item.key) {
      return;
    }

    if (findMatchingNavItem(pathname, [item])) {
      matchedGroups.add(item.key);
    }
  });

  return matchedGroups;
}

function getExpandableGroupKeys(items) {
  const groupKeys = new Set();

  (items || []).forEach((item) => {
    if (item?.key && Array.isArray(item?.children) && item.children.length > 0) {
      groupKeys.add(item.key);
    }
  });

  return groupKeys;
}

function normalizeBadgeCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.max(0, Math.trunc(count));
}

function formatBadgeCount(value) {
  const count = normalizeBadgeCount(value);
  if (!count) {
    return "";
  }

  return count > 99 ? "99+" : String(count);
}

function getSidebarItemLabel(item) {
  const label = String(item?.label || "").trim();
  const helperText = String(item?.helperText || "").trim();
  return helperText ? `${label}. ${helperText}` : label;
}

function SidebarBadge({ count, compact = false }) {
  const badgeText = formatBadgeCount(count);
  if (!badgeText) {
    return null;
  }

  return (
    <span
      className={classNames(
        "relative inline-flex shrink-0",
        compact ? "absolute -right-1 -top-1" : ""
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-full bg-rose-400/70 animate-ping" />
      <span
        className={classNames(
          "relative inline-flex items-center justify-center rounded-full bg-rose-600 font-semibold leading-none text-white shadow-sm ring-2 ring-white",
          compact ? "min-w-[1.1rem] px-1 py-0.5 text-[9px]" : "min-w-[1.35rem] px-1.5 py-0.5 text-[10px]"
        )}
      >
        {badgeText}
      </span>
    </span>
  );
}

const activeNavItemClasses =
  "border-indigo-500 bg-indigo-50 text-indigo-700 ring-indigo-100 shadow-sm dark:border-transparent dark:bg-white dark:text-slate-950 dark:ring-white/80";

const inactiveNavItemClasses =
  "border-transparent text-slate-600 hover:bg-white hover:text-slate-900 hover:ring-slate-200 hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:hover:ring-slate-700";

export function Sidebar({
  items,
  headerTitle = "Menu",
  headerSubtitle = "Navigation",
  headerVariant = "default",
  icon,
  headerAction,
  profileLabel = "Signed in as",
  profileName,
  profileTitle,
  profileMeta,
  profileAvatarSrc,
  profileAvatarAlt,
  showProfileAvatar = true,
  profilePlacement = "top",
  footerLabel,
  footerValue,
  routeLoading = false,
  onItemClick,
  collapsed = false,
  onExpandFromCollapsed,
}) {
  const location = useLocation();
  const expandableGroupKeys = useMemo(() => getExpandableGroupKeys(items), [items]);
  const [expandedGroupKey, setExpandedGroupKey] = useState(() => {
    const matchingGroup = Array.from(getMatchingGroupKeys(items, location.pathname))[0];
    return matchingGroup || null;
  });

  useEffect(() => {
    const nextOpenGroupKey = Array.from(getMatchingGroupKeys(items, location.pathname))[0] || null;

    setExpandedGroupKey((current) => {
      if (nextOpenGroupKey) {
        if (current === nextOpenGroupKey) {
          return current;
        }

        return nextOpenGroupKey;
      }

      if (current && expandableGroupKeys.has(current)) {
        return current;
      }

      return null;
    });
  }, [expandableGroupKeys, items, location.pathname]);

  const profileInitials = useMemo(() => {
    const seed = [profileName, profileMeta, headerTitle].find((value) => String(value || "").trim()) || "User";

    return (
      String(seed)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "U"
    );
  }, [headerTitle, profileMeta, profileName]);
  const hasProfileSummary = Boolean(profileName || profileTitle || profileMeta || profileAvatarSrc);
  const shouldShowProfileAvatar = showProfileAvatar && Boolean(profileAvatarSrc || profileInitials);
  const showProfileName = Boolean(profileName);
  const showProfileMeta = Boolean(profileMeta && profileMeta !== profileName);

  const renderProfileSummary = (position = "top") => (
    <div className={position === "bottom" ? "border-t border-slate-200 px-4 py-4" : "border-b border-slate-200 px-4 py-4"}>
      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
        <div className={classNames("flex", shouldShowProfileAvatar ? "items-start gap-3" : "flex-col")}>
          {shouldShowProfileAvatar ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-sm ring-1 ring-white/40">
              {profileAvatarSrc ? (
                <img
                  src={profileAvatarSrc}
                  alt={profileAvatarAlt || profileName || profileTitle || profileMeta || "Profile"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{profileInitials}</span>
              )}
            </div>
          ) : null}

          <div className={classNames("min-w-0", shouldShowProfileAvatar ? "flex-1" : "space-y-2")}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {profileLabel}
            </div>
            {showProfileName ? <div className="truncate text-sm font-semibold text-slate-900">{profileName}</div> : null}
            {profileTitle ? (
              <div className="inline-flex max-w-full items-center rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {profileTitle}
              </div>
            ) : null}
            {showProfileMeta ? <div className="truncate text-xs text-slate-500">{profileMeta}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );

  const toggleGroup = (groupKey) => {
    if (!groupKey) {
      return;
    }

    setExpandedGroupKey((current) => (current === groupKey ? null : groupKey));
  };
  const ensureGroupExpanded = (groupKey) => {
    if (!groupKey) {
      return;
    }

    setExpandedGroupKey((current) => {
      if (current === groupKey) {
        return current;
      }

      return groupKey;
    });
  };

  const isRoleCardHeader = headerVariant === "card";
  const roleHeaderStyle = isRoleCardHeader
    ? {
        borderColor: "var(--theme-border)",
        background:
          "linear-gradient(90deg, var(--theme-surface-muted) 0%, var(--theme-surface) 55%, var(--theme-surface-muted) 100%)",
      }
    : undefined;
  const roleCardStyle = isRoleCardHeader
    ? {
        borderColor: "var(--theme-border-strong)",
        backgroundColor: "var(--theme-surface)",
        color: "var(--theme-text-primary)",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
      }
    : undefined;

  return (
    <aside
      className={classNames(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50/95 text-slate-700 transition-[width] duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div
        className={classNames(
          "flex h-16 shrink-0 items-center border-b px-4",
          isRoleCardHeader ? "" : "border-slate-200"
        )}
        style={roleHeaderStyle}
      >
        {collapsed ? (
          <div className="flex w-full items-center justify-center">
            {headerAction ? (
              <button
                type="button"
                onClick={headerAction.onClick}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                style={roleCardStyle}
                aria-label={headerAction.label || "Toggle sidebar"}
                title={headerAction.label || "Toggle sidebar"}
              >
                {headerAction.icon || (
                  <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm">
                {icon || (
                  <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </span>
            )}
          </div>
        ) : isRoleCardHeader ? (
          <div className="flex w-full items-center justify-between gap-3">
            {headerTitle ? (
              <div className="inline-flex items-center rounded-xl border px-4 py-2 text-sm font-semibold" style={roleCardStyle}>
                {headerTitle}
              </div>
            ) : null}

            {headerAction ? (
              <button
                type="button"
                onClick={headerAction.onClick}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                style={roleCardStyle}
                aria-label={headerAction.label || "Toggle sidebar"}
              >
                {headerAction.icon || (
                  <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
              {icon || (
                <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              )}
            </span>

            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">{headerTitle}</div>
              {headerSubtitle ? <div className="text-xs text-slate-500">{headerSubtitle}</div> : null}
            </div>
          </div>
        )}
      </div>

      {hasProfileSummary && !collapsed && profilePlacement !== "bottom" ? renderProfileSummary("top") : null}

      <nav
        className={classNames(
          "flex-1 min-h-0 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3"
        )}
        aria-label={`${headerTitle} navigation`}
      >
        <ul className={collapsed ? "space-y-2" : "space-y-4"}>
          {items?.map((item) => (
            <li key={item.key || item.to}>
              {collapsed ? (
                Array.isArray(item?.children) && item.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      ensureGroupExpanded(item.key);

                      if (typeof onExpandFromCollapsed === "function") {
                        onExpandFromCollapsed();
                        return;
                      }

                      toggleGroup(item.key);
                    }}
                    className={classNames(
                      "flex h-11 w-full items-center justify-center rounded-xl border-l-4 px-3 transition-all duration-150 ring-1 ring-transparent",
                      findMatchingNavItem(location.pathname, [item])
                        ? activeNavItemClasses
                        : inactiveNavItemClasses,
                      routeLoading && "pointer-events-none opacity-60"
                    )}
                    disabled={routeLoading}
                    aria-label={getSidebarItemLabel(item)}
                    title={getSidebarItemLabel(item)}
                  >
                    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
                      {item.icon || <span className="h-0 w-0" />}
                      {normalizeBadgeCount(item?.badgeCount) > 0 ? <SidebarBadge count={item.badgeCount} compact /> : null}
                    </span>
                    <span className="sr-only">{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    end={Boolean(item?.end || item?.exact || item?.key === "dashboard")}
                    onClick={(event) => {
                      if (typeof onItemClick === "function") {
                        onItemClick(item, event, {
                          currentPath: location.pathname,
                        });
                      }
                    }}
                    className={({ isActive }) =>
                      classNames(
                        "group relative flex h-11 w-full items-center justify-center rounded-xl border-l-4 px-3 transition-all duration-150 ring-1 ring-transparent",
                        isActive ? activeNavItemClasses : inactiveNavItemClasses,
                        routeLoading && "pointer-events-none opacity-60"
                      )
                    }
                    aria-disabled={routeLoading}
                    tabIndex={routeLoading ? -1 : 0}
                    aria-label={getSidebarItemLabel(item)}
                    title={getSidebarItemLabel(item)}
                  >
                    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
                      {item.icon || <span className="h-0 w-0" />}
                      {normalizeBadgeCount(item?.badgeCount) > 0 ? <SidebarBadge count={item.badgeCount} compact /> : null}
                    </span>

                    <span className="sr-only">{item.label}</span>
                  </NavLink>
                )
              ) : Array.isArray(item?.children) && item.children.length > 0 ? (
                <div className="space-y-2">
                  {item.sectionLabel ? (
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {item.sectionLabel}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => toggleGroup(item.key)}
                    aria-expanded={expandedGroupKey === item.key}
                    aria-controls={`sidebar-group-${item.key}`}
                    className={classNames(
                      "flex min-h-11 w-full justify-between rounded-xl border-l-4 px-3 text-sm font-medium transition-all duration-150 ring-1 ring-transparent",
                      item?.helperText ? "items-start py-2.5" : "items-center",
                      findMatchingNavItem(location.pathname, [item])
                        ? activeNavItemClasses
                        : inactiveNavItemClasses,
                      routeLoading && "pointer-events-none opacity-60"
                    )}
                    disabled={routeLoading}
                  >
                    <span className={classNames("flex min-w-0 gap-3", item?.helperText ? "items-start" : "items-center")}>
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
                        {item.icon || <span className="h-0 w-0" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{item.label}</span>
                          {normalizeBadgeCount(item?.badgeCount) > 0 ? <SidebarBadge count={item.badgeCount} /> : null}
                        </span>
                        {item?.helperText ? (
                          <span className="mt-0.5 block text-left text-[11px] font-normal leading-4 text-slate-500">
                            {item.helperText}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <ChevronDown
                      className={classNames(
                        "h-4 w-4 shrink-0 transition-transform duration-200",
                        item?.helperText ? "mt-0.5" : "",
                        expandedGroupKey === item.key ? "rotate-180 text-current" : "text-slate-400"
                      )}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>

                  {expandedGroupKey === item.key ? (
                    <div id={`sidebar-group-${item.key}`} className="space-y-1 pl-8">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.key || child.to}
                          to={child.to}
                          end={Boolean(child?.end || child?.exact)}
                          onClick={(event) => {
                            if (typeof onItemClick === "function") {
                              onItemClick(child, event, {
                                currentPath: location.pathname,
                              });
                            }
                          }}
                          className={({ isActive }) =>
                            classNames(
                              "group flex h-10 w-full items-center gap-2 rounded-lg border-l-4 px-3 text-sm font-medium transition-all duration-150 ring-1 ring-transparent",
                              isActive ? activeNavItemClasses : inactiveNavItemClasses,
                              routeLoading && "pointer-events-none opacity-60"
                            )
                          }
                          aria-disabled={routeLoading}
                          tabIndex={routeLoading ? -1 : 0}
                        >
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-current">
                            {child.icon || <span className="h-0 w-0" />}
                          </span>

                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-1">
                  {item.sectionLabel ? (
                    <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {item.sectionLabel}
                    </div>
                  ) : null}

                  <NavLink
                    to={item.to}
                    end={Boolean(item?.end || item?.exact || item?.key === "dashboard")}
                    onClick={(event) => {
                      if (typeof onItemClick === "function") {
                        onItemClick(item, event, {
                          currentPath: location.pathname,
                        });
                      }
                    }}
                    className={({ isActive }) =>
                      classNames(
                        "group relative flex min-h-11 w-full gap-3 rounded-xl border-l-4 px-3 text-sm font-medium transition-all duration-150 ring-1 ring-transparent",
                        item?.helperText ? "items-start py-2.5" : "items-center",
                        isActive ? activeNavItemClasses : inactiveNavItemClasses,
                        routeLoading && "pointer-events-none opacity-60"
                      )
                    }
                    aria-disabled={routeLoading}
                    tabIndex={routeLoading ? -1 : 0}
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
                      {item.icon || <span className="h-0 w-0" />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{item.label}</span>
                        {normalizeBadgeCount(item?.badgeCount) > 0 ? <SidebarBadge count={item.badgeCount} /> : null}
                      </span>
                      {item?.helperText ? (
                        <span className="mt-0.5 block text-[11px] font-normal leading-4 text-slate-500">
                          {item.helperText}
                        </span>
                      ) : null}
                    </span>
                  </NavLink>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {hasProfileSummary && !collapsed && profilePlacement === "bottom" ? renderProfileSummary("bottom") : null}

      {!collapsed && (footerLabel || footerValue) ? (
        <div className={profilePlacement === "bottom" && hasProfileSummary ? "border-t border-slate-200 px-4 py-4" : "border-t border-slate-200 px-4 py-4"}>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            {footerLabel ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {footerLabel}
              </div>
            ) : null}

            {footerValue ? (
              <div className="mt-1 break-all text-sm font-medium text-slate-800">
                {footerValue}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

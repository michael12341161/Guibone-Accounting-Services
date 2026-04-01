import React, { useMemo } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { hasFeatureActionAccess, hasModuleAccess } from "../../utils/module_permissions";
import { useRouteLoading } from "../layout/route_loading_context";
import { normalizePath } from "../layout/layout_utils";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function normalizeTrailEntry(entry, context) {
  if (!entry) return null;

  if (typeof entry === "string") {
    return null;
  }

  const label =
    typeof entry.getLabel === "function"
      ? entry.getLabel(context)
      : entry.label;
  const path =
    typeof entry.getPath === "function"
      ? entry.getPath(context)
      : entry.path || entry.to;

  if (!label || !path) return null;

  return {
    label,
    path: normalizePath(path),
    icon: entry.icon || null,
    accessKey: entry.accessKey || null,
    actionKey: entry.actionKey || null,
  };
}

function humanizeSegment(segment) {
  const decoded = decodeURIComponent(String(segment || "").trim());

  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPathWithinBase(pathname, basePath) {
  if (basePath === "/") return true;
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function normalizeBreadcrumbEntry(entry, context) {
  if (!entry) return null;

  if (typeof entry === "string") {
    return { label: entry };
  }

  const label =
    typeof entry.getLabel === "function"
      ? entry.getLabel(context)
      : entry.label;

  if (!label) return null;

  return {
    label,
    icon: entry.icon || null,
    trailingItems: Array.isArray(entry.trailingItems)
      ? entry.trailingItems
          .map((item) => normalizeTrailEntry(item, context))
          .filter(Boolean)
      : [],
  };
}

function resolveDynamicRouteMeta(pathname, config) {
  for (const route of config?.dynamicRoutes || []) {
    const match = matchPath({ path: normalizePath(route.pattern), end: true }, pathname);
    if (!match) continue;

    return normalizeBreadcrumbEntry(route, {
      pathname,
      params: match.params || {},
    });
  }

  return null;
}

function resolveBreadcrumbMeta(pathname, segment, config) {
  const context = {
    pathname,
    segment,
    decodedSegment: decodeURIComponent(String(segment || "")),
  };

  return (
    normalizeBreadcrumbEntry(config?.exactPaths?.[pathname], context) ||
    resolveDynamicRouteMeta(pathname, config) ||
    normalizeBreadcrumbEntry(config?.segmentLabels?.[segment], context) || {
      label: humanizeSegment(segment),
    }
  );
}

export function buildBreadcrumbItems(pathname, config = {}, canAccessTrailItem = () => true) {
  const normalizedPath = normalizePath(pathname || "/");
  const basePath = normalizePath(config.basePath || "/");
  const hiddenPaths = Array.isArray(config.hiddenPaths)
    ? config.hiddenPaths.map((path) => normalizePath(path))
    : [];

  if (!isPathWithinBase(normalizedPath, basePath)) {
    return [];
  }

  if (hiddenPaths.includes(normalizedPath)) {
    return [];
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  const items = [];
  const collectedSegments = [];

  segments.forEach((segment, index) => {
    collectedSegments.push(segment);

    const itemPath = normalizePath(`/${collectedSegments.join("/")}`);
    if (!isPathWithinBase(itemPath, basePath)) {
      return;
    }

    const meta = resolveBreadcrumbMeta(itemPath, segment, config);

    items.push({
      path: itemPath,
      label: meta?.label || humanizeSegment(segment),
      icon: meta?.icon || null,
      isCurrent: index === segments.length - 1,
    });

    if (index === segments.length - 1 && Array.isArray(meta?.trailingItems)) {
      meta.trailingItems.forEach((trailItem) => {
        if (!canAccessTrailItem(trailItem)) {
          return;
        }

        items.push({
          path: trailItem.path,
          label: trailItem.label,
          icon: trailItem.icon || null,
          isCurrent: false,
        });
      });
    }
  });

  return items;
}

export default function RouteBreadcrumbs({ config, className }) {
  const location = useLocation();
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const { routeLoading, startRouteLoading } = useRouteLoading();
  const items = useMemo(
    () =>
      buildBreadcrumbItems(location.pathname, config, (trailItem) => {
        if (!trailItem?.accessKey || !user) {
          return true;
        }

        if (trailItem.actionKey) {
          return hasFeatureActionAccess(user, trailItem.accessKey, trailItem.actionKey, permissions);
        }

        return hasModuleAccess(user, trailItem.accessKey, permissions);
      }),
    [config, location.pathname, permissions, user]
  );

  if (items.length === 0) {
    return null;
  }

  const separator = config?.separator || ">";

  return (
    <nav
      aria-label="Breadcrumb"
      className={classNames("mb-6 w-full overflow-x-auto", className)}
    >
      <ol className="inline-flex min-w-max items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm shadow-slate-200/50 backdrop-blur">
        {items.map((item, index) => {
          const Icon = item.icon;

          const content = (
            <span
              className={classNames(
                "inline-flex max-w-[14rem] items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition sm:max-w-[18rem]",
                item.isCurrent
                  ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              {Icon ? (
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              ) : null}
              <span className="truncate">{item.label}</span>
            </span>
          );

          return (
            <li key={item.path} className="flex min-w-0 shrink-0 items-center gap-1">
              {index > 0 ? (
                <span
                  className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300"
                  aria-hidden="true"
                >
                  {separator}
                </span>
              ) : null}

              {item.isCurrent ? (
                <span aria-current="page" className="inline-flex">
                  {content}
                </span>
              ) : (
                <Link
                  to={item.path}
                  onClick={(event) => {
                    const currentPath = normalizePath(location.pathname);
                    const nextPath = normalizePath(item.path);

                    if (routeLoading || currentPath === nextPath) {
                      event.preventDefault();
                      return;
                    }

                    startRouteLoading();
                  }}
                  className={classNames(
                    "inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
                    routeLoading && "pointer-events-none opacity-60"
                  )}
                  aria-disabled={routeLoading}
                  tabIndex={routeLoading ? -1 : 0}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

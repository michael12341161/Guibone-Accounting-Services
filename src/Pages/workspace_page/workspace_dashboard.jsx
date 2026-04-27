import React, { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader } from "../../components/UI/card";
import { resolveNavKey } from "../../components/layout/layout_utils";
import DashboardHero from "../../components/layout/dashboard_hero";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import WorkspaceLayout, { workspaceNavItems } from "../../layouts/WorkspaceLayout";
import { filterNavItemsByAccess } from "../../utils/module_permissions";

function buildQuickLinks(navItems) {
  return (navItems || [])
    .filter((item) => item?.key && item.key !== "dashboard")
    .map((item) => {
      const children = Array.isArray(item.children) ? item.children.filter((child) => child?.to) : [];
      const primaryRoute = item.to || children[0]?.to || "/workspace";
      const toolLabels = children.map((child) => child.label).filter(Boolean);
      const description =
        toolLabels.length > 0
          ? toolLabels.slice(0, 3).join(" | ")
          : "Open the tools available for this role.";

      return {
        key: item.key,
        label: item.label,
        to: primaryRoute,
        icon: item.icon || null,
        description,
        toolCount: toolLabels.length,
      };
    });
}

export default function WorkspaceDashboard({ user, onLogout }) {
  const { permissions } = useModulePermissions();
  const location = useLocation();
  const currentKey = useMemo(
    () => resolveNavKey(location.pathname, workspaceNavItems, "/workspace"),
    [location.pathname]
  );
  const visibleNavItems = useMemo(
    () => filterNavItemsByAccess(user, workspaceNavItems, permissions),
    [permissions, user]
  );
  const quickLinks = useMemo(() => buildQuickLinks(visibleNavItems), [visibleNavItems]);

  return (
    <WorkspaceLayout user={user} onLogout={onLogout}>
      {currentKey === "dashboard" ? <DashboardHero user={user} /> : null}

      <Outlet />

      {(location.pathname === "/workspace" || location.pathname === "/workspace/") && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card compact>
              <CardHeader
                title="Assigned Access"
                description="This workspace is built from the modules your admin enabled for this role."
              />
              <CardContent className="space-y-2">
                <p className="text-sm leading-6 text-slate-600">
                  Use the sidebar or the shortcuts below. When permissions change, this dashboard updates with them.
                </p>
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {quickLinks.length} module{quickLinks.length === 1 ? "" : "s"} available
                </div>
              </CardContent>
            </Card>

            <Card compact variant="muted">
              <CardHeader
                title="Permission-Based Home"
                description="Only the sections allowed for this role are shown here."
              />
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">
                  If a module is missing, it has not been enabled yet in the Permissions page.
                </p>
              </CardContent>
            </Card>
          </div>

          {quickLinks.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quickLinks.map((item) => (
                <Link key={item.key} to={item.to} className="block no-underline">
                  <Card interactive compact className="min-h-[168px]">
                    <CardHeader
                      title={item.label}
                      description={item.description}
                      action={
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                          {item.icon}
                        </div>
                      }
                    />
                    <CardContent className="flex h-full flex-col justify-between">
                      <div className="text-xs font-medium text-slate-500">
                        {item.toolCount > 0 ? `${item.toolCount} available tools` : "Open module"}
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700">
                        <span>Open</span>
                        <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card compact className="mt-6">
              <CardHeader
                title="No Modules Enabled Yet"
                description="This role can sign in, but no modules are currently assigned."
              />
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">
                  An admin can enable modules for this role from the Permissions page.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </WorkspaceLayout>
  );
}

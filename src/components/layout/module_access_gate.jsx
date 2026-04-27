import React, { useMemo, useState } from "react";
import { ChevronLeft, Lock, Send } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getHomePathForRole } from "../../context/AuthContext";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { normalizePath } from "./layout_utils";
import { useAuth } from "../../hooks/useAuth";
import { RouteLoadingPanel } from "./route_loading_panel";
import { requestModuleAccess } from "../../services/api";
import { showErrorToast, showSuccessToast } from "../../utils/feedback";
import {
  getFeatureActionLabel,
  getModuleLabelByKey,
  hasFeatureActionAccess,
  hasModuleAccess,
  MODULE_ACCESS_DENIED_MESSAGE,
} from "../../utils/module_permissions";

export function ModuleAccessGate({ moduleKey, actionKey = null, children }) {
  const { user, role, isAuthReady } = useAuth();
  const { permissions, isLoading, error, refreshPermissions } = useModulePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [requesting, setRequesting] = useState(false);
  const hasResolvedUser = Boolean(user?.id || user?.username);

  const moduleLabel = useMemo(() => {
    const featureLabel = getModuleLabelByKey(moduleKey);
    if (!actionKey) {
      return featureLabel;
    }

    const actionLabel = getFeatureActionLabel(moduleKey, actionKey);
    return actionLabel ? `${featureLabel}: ${actionLabel}` : featureLabel;
  }, [actionKey, moduleKey]);

  if ((!isAuthReady && !hasResolvedUser) || (hasResolvedUser && !permissions && !error)) {
    return (
      <div className="py-8">
        <RouteLoadingPanel />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading && !permissions) {
    return (
      <div className="py-8">
        <RouteLoadingPanel />
      </div>
    );
  }

  const hasAccess = actionKey
    ? hasFeatureActionAccess(user, moduleKey, actionKey, permissions)
    : hasModuleAccess(user, moduleKey, permissions);

  if (hasAccess) {
    return children;
  }

  if (error && !permissions) {
    return (
      <div className="flex min-h-[420px] items-center justify-center py-8">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>

          <h1 className="mt-4 text-xl font-semibold text-slate-900">Unable to load permissions</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            We could not verify access from the server. Please try again.
          </p>

          <button
            type="button"
            onClick={() => {
              void refreshPermissions();
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const homePath = getHomePathForRole(user?.role_id ?? role);
  const currentPath = normalizePath(location.pathname);
  const backPath = homePath && normalizePath(homePath) !== currentPath ? homePath : "/";

  const handleRequestAccess = async () => {
    if (requesting) {
      return;
    }

    setRequesting(true);
    try {
      await requestModuleAccess(moduleKey, moduleLabel);
      showSuccessToast("Access request sent to Admin.");
    } catch (requestError) {
      showErrorToast(requestError?.response?.data?.message || "Unable to send access request.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="flex min-h-[420px] items-center justify-center py-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-4 text-xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{MODULE_ACCESS_DENIED_MESSAGE}</p>

        <p className="mt-2 text-xs text-slate-500">Module: {moduleLabel}</p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleRequestAccess}
            disabled={requesting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {requesting ? "Sending..." : "Request Access"}
          </button>

          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

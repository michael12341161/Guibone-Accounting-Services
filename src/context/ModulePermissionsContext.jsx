import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchModulePermissions, saveModulePermissions } from "../services/api";
import {
  MODULE_PERMISSION_CHANGE_EVENT,
  MODULE_PERMISSION_CHANGE_STORAGE_KEY,
  mergePermissions,
} from "../utils/module_permissions";
import { useAuth } from "../hooks/useAuth";
import { useErrorToast } from "../utils/feedback";

const ModulePermissionsContext = createContext(null);

function formatErrorMessage(error) {
  return error?.response?.data?.message || error?.message || "Unable to load module permissions.";
}

export function ModulePermissionsProvider({ children }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(user?.id));
  const [error, setError] = useState("");
  useErrorToast(error);
  const isMountedRef = useRef(false);

  useEffect(
    () => {
      // React Strict Mode mounts, cleans up, and mounts again in development.
      // Keep the mounted flag aligned with the current effect lifecycle so the
      // initial permissions fetch can complete and clear the loading state.
      isMountedRef.current = true;

      return () => {
        isMountedRef.current = false;
      };
    },
    []
  );

  const refreshPermissions = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.id) {
        if (!isMountedRef.current) {
          return null;
        }
        setPermissions(null);
        setError("");
        if (!silent) {
          setIsLoading(false);
        }
        return null;
      }

      if (!silent) {
        setIsLoading(true);
      }

      try {
        const response = await fetchModulePermissions();
        if (!isMountedRef.current) {
          return null;
        }
        const nextPermissions = mergePermissions(response?.data?.permissions);
        setPermissions(nextPermissions);
        setError("");
        return nextPermissions;
      } catch (nextError) {
        if (!isMountedRef.current) {
          return null;
        }
        const message = formatErrorMessage(nextError);
        setError(message);
        return null;
      } finally {
        if (!isMountedRef.current) {
          return null;
        }
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [user?.id]
  );

  const savePermissions = useCallback(
    async (nextPermissions) => {
      const response = await saveModulePermissions(nextPermissions);
      if (!isMountedRef.current) {
        return mergePermissions(response?.data?.permissions ?? nextPermissions);
      }
      const normalized = mergePermissions(response?.data?.permissions ?? nextPermissions);
      setPermissions(normalized);
      setError("");
      try {
        window.localStorage.setItem(MODULE_PERMISSION_CHANGE_STORAGE_KEY, String(Date.now()));
      } catch (_) {}
      window.dispatchEvent(new Event(MODULE_PERMISSION_CHANGE_EVENT));
      return normalized;
    },
    []
  );

  useEffect(() => {
    if (!user?.id) {
      if (isMountedRef.current) {
        setPermissions(null);
        setError("");
        setIsLoading(false);
      }
      return undefined;
    }

    void refreshPermissions();

    const handlePermissionChange = () => {
      if (user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const handleStorage = (event) => {
      if (event?.key === MODULE_PERMISSION_CHANGE_STORAGE_KEY && user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const handleFocus = () => {
      if (user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const intervalId = window.setInterval(() => {
      if (user?.id) {
        void refreshPermissions({ silent: true });
      }
    }, 12000);

    window.addEventListener("storage", handleStorage);
    window.addEventListener(MODULE_PERMISSION_CHANGE_EVENT, handlePermissionChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(MODULE_PERMISSION_CHANGE_EVENT, handlePermissionChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshPermissions, user?.id]);

  const value = useMemo(
    () => ({
      permissions,
      isLoading,
      error,
      refreshPermissions,
      savePermissions,
    }),
    [error, isLoading, permissions, refreshPermissions, savePermissions]
  );

  return <ModulePermissionsContext.Provider value={value}>{children}</ModulePermissionsContext.Provider>;
}

export function useModulePermissions() {
  const context = useContext(ModulePermissionsContext);

  if (!context) {
    throw new Error("useModulePermissions must be used within a ModulePermissionsProvider");
  }

  return context;
}

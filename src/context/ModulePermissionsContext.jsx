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
const MODULE_PERMISSION_CACHE_PREFIX = "monitoring:permissions-cache";

function formatErrorMessage(error) {
  return error?.response?.data?.message || error?.message || "Unable to load module permissions.";
}

function getPermissionCacheKey(userId) {
  const normalizedUserId = String(userId ?? "").trim();
  return normalizedUserId ? `${MODULE_PERMISSION_CACHE_PREFIX}:${normalizedUserId}` : "";
}

function readCachedPermissions(userId) {
  if (typeof window === "undefined") {
    return null;
  }

  const cacheKey = getPermissionCacheKey(userId);
  if (!cacheKey) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);
    return raw ? mergePermissions(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

function writeCachedPermissions(userId, permissions) {
  if (typeof window === "undefined") {
    return;
  }

  const cacheKey = getPermissionCacheKey(userId);
  if (!cacheKey || !permissions || typeof permissions !== "object") {
    return;
  }

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(mergePermissions(permissions)));
  } catch (_) {}
}

export function ModulePermissionsProvider({ children }) {
  const { user, isAuthReady } = useAuth();
  const initialCachedPermissions = readCachedPermissions(user?.id);
  const [permissions, setPermissions] = useState(() => initialCachedPermissions);
  const [isLoading, setIsLoading] = useState(() => Boolean(user?.id) && !initialCachedPermissions);
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
      const cachedPermissions = readCachedPermissions(user?.id);

      if (!isAuthReady) {
        if (!isMountedRef.current) {
          return null;
        }
        setPermissions(cachedPermissions);
        setError("");
        if (!silent) {
          setIsLoading(Boolean(user?.id) && !cachedPermissions);
        }
        return null;
      }

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
        writeCachedPermissions(user?.id, nextPermissions);
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
    [isAuthReady, user?.id]
  );

  const savePermissions = useCallback(
    async (nextPermissions) => {
      const response = await saveModulePermissions(nextPermissions);
      if (!isMountedRef.current) {
        return mergePermissions(response?.data?.permissions ?? nextPermissions);
      }
      const normalized = mergePermissions(response?.data?.permissions ?? nextPermissions);
      setPermissions(normalized);
      writeCachedPermissions(user?.id, normalized);
      setError("");
      try {
        window.localStorage.setItem(MODULE_PERMISSION_CHANGE_STORAGE_KEY, String(Date.now()));
      } catch (_) {}
      window.dispatchEvent(new Event(MODULE_PERMISSION_CHANGE_EVENT));
      return normalized;
    },
    [user?.id]
  );

  useEffect(() => {
    const cachedPermissions = readCachedPermissions(user?.id);

    if (!isAuthReady) {
      if (isMountedRef.current) {
        setPermissions(cachedPermissions);
        setError("");
        setIsLoading(Boolean(user?.id) && !cachedPermissions);
      }
      return undefined;
    }

    if (!user?.id) {
      if (isMountedRef.current) {
        setPermissions(null);
        setError("");
        setIsLoading(false);
      }
      return undefined;
    }

    if (isMountedRef.current) {
      setPermissions(cachedPermissions);
      setError("");
      setIsLoading(!cachedPermissions);
    }

    void refreshPermissions({ silent: Boolean(cachedPermissions) });

    const handlePermissionChange = () => {
      if (isAuthReady && user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const handleStorage = (event) => {
      if (event?.key === MODULE_PERMISSION_CHANGE_STORAGE_KEY && isAuthReady && user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const handleFocus = () => {
      if (isAuthReady && user?.id) {
        void refreshPermissions({ silent: true });
      }
    };

    const intervalId = window.setInterval(() => {
      if (isAuthReady && user?.id) {
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
  }, [isAuthReady, refreshPermissions, user?.id]);

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

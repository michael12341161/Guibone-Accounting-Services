import React, { createContext, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  api,
  clearStoredAuthToken,
  DEFAULT_SECURITY_SETTINGS,
  MONITORING_AUTH_INVALID_EVENT,
  normalizeSecuritySettings,
} from "../services/api";
import { getUserRole, hasRole as userHasRole } from "../utils/helpers";

const SESSION_USER_KEY = "session:user";
const LOGIN_STATE_KEY = "isLoggedIn";
const USER_ROLE_KEY = "user_role";
const USER_ID_KEY = "user_id";
const ONE_MINUTE_MS = 60 * 1000;

const ROLE_HOME_PATHS = {
  1: "/admin",
  2: "/secretary",
  3: "/accountant",
  4: "/client",
};

export const AuthContext = createContext(null);

function getSessionWarningWindowMs(timeoutMs) {
  if (timeoutMs > ONE_MINUTE_MS) {
    return ONE_MINUTE_MS;
  }

  return null;
}

function formatSessionWarningLabel(durationMs) {
  const minutes = Math.max(1, Math.round(durationMs / ONE_MINUTE_MS));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function normalizeSessionUser(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  return {
    ...user,
    security_settings: normalizeSecuritySettings(user.security_settings),
  };
}

function readSessionUser() {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? normalizeSessionUser(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

export function readStoredLoginState() {
  try {
    const isLoggedIn = localStorage.getItem(LOGIN_STATE_KEY) === "true";
    const roleIdRaw = localStorage.getItem(USER_ROLE_KEY);
    const userIdRaw = localStorage.getItem(USER_ID_KEY);
    const roleId = roleIdRaw === null ? null : Number(roleIdRaw);
    const userId = userIdRaw === null ? null : Number(userIdRaw);

    return {
      isLoggedIn,
      roleId: Number.isInteger(roleId) ? roleId : null,
      userId: Number.isInteger(userId) ? userId : null,
      user: readSessionUser(),
    };
  } catch (_) {
    return {
      isLoggedIn: false,
      roleId: null,
      userId: null,
      user: null,
    };
  }
}

function persistStoredAuth(user) {
  if (!user) {
    clearStoredAuth();
    return;
  }

  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  localStorage.setItem(LOGIN_STATE_KEY, "true");
  localStorage.setItem(USER_ROLE_KEY, String(user.role_id ?? ""));
  localStorage.setItem(USER_ID_KEY, String(user.id ?? ""));
}

function clearStoredAuth() {
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(LOGIN_STATE_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
  localStorage.removeItem(USER_ID_KEY);
  clearStoredAuthToken();
}

export function getHomePathForRole(roleId) {
  return ROLE_HOME_PATHS[roleId] || "/";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSessionUser());
  const sessionWarningVisibleRef = React.useRef(false);
  const activeUserId = user?.id ?? null;
  const sessionTimeoutMinutes = Math.max(
    1,
    Number(user?.security_settings?.sessionTimeoutMinutes || DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes)
  );

  const clearActiveClientAuth = () => {
    if (sessionWarningVisibleRef.current) {
      sessionWarningVisibleRef.current = false;
      void Swal.close();
    }

    setUser(null);

    try {
      clearStoredAuth();
    } catch (_) {}
  };

  const login = (nextUser) => {
    const normalizedUser = normalizeSessionUser(nextUser);

    if (sessionWarningVisibleRef.current) {
      sessionWarningVisibleRef.current = false;
      void Swal.close();
    }

    setUser(normalizedUser);

    try {
      if (normalizedUser) {
        persistStoredAuth(normalizedUser);
      } else {
        clearStoredAuth();
      }
    } catch (_) {}
  };

  const logout = () => {
    void api.post("logout.php").catch(() => {});
    clearActiveClientAuth();
  };

  useEffect(() => {
    if (activeUserId === null) {
      return undefined;
    }

    const timeoutMs = sessionTimeoutMinutes * 60 * 1000;
    const warningWindowMs = getSessionWarningWindowMs(timeoutMs);
    const events = ["click", "mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    let timeoutId = null;
    let warningId = null;
    let active = true;
    let warningVisible = false;
    let sessionCleared = false;

    const clearTimers = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (warningId !== null) {
        window.clearTimeout(warningId);
        warningId = null;
      }
    };

    const clearSession = () => {
      if (sessionCleared) {
        return;
      }

      sessionCleared = true;
      warningVisible = false;
      clearTimers();
      clearActiveClientAuth();
    };

    const resetTimer = () => {
      if (!active || sessionCleared) {
        return;
      }

      clearTimers();
      timeoutId = window.setTimeout(clearSession, timeoutMs);

      if (warningWindowMs !== null) {
        const warningDelayMs = timeoutMs - warningWindowMs;
        warningId = window.setTimeout(() => {
          if (!active || sessionCleared || warningVisible) {
            return;
          }

          warningVisible = true;
          sessionWarningVisibleRef.current = true;

          void Swal.fire({
            title: "Session Expiring Soon",
            html: `<p>Your session will expire in ${formatSessionWarningLabel(
              warningWindowMs
            )} due to inactivity.</p><p>Click "Stay Logged In" to continue.</p>`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Stay Logged In",
            cancelButtonText: "Logout",
            reverseButtons: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
            confirmButtonColor: "#2563eb",
            cancelButtonColor: "#dc2626",
          }).then((result) => {
            warningVisible = false;
            sessionWarningVisibleRef.current = false;

            if (!active || sessionCleared) {
              return;
            }

            if (result.isConfirmed) {
              resetTimer();
              return;
            }

            clearSession();
          });
        }, warningDelayMs);
      }
    };

    const handleActivity = () => {
      if (warningVisible) {
        return;
      }

      resetTimer();
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("focus", handleActivity);
    resetTimer();

    return () => {
      active = false;
      warningVisible = false;
      clearTimers();
      if (sessionWarningVisibleRef.current) {
        sessionWarningVisibleRef.current = false;
        void Swal.close();
      }

      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("focus", handleActivity);
    };
  }, [activeUserId, sessionTimeoutMinutes]);

  useEffect(() => {
    let active = true;

    const syncSession = async () => {
      try {
        const response = await api.get("session_status.php");
        if (!active) {
          return;
        }

        const nextUser = normalizeSessionUser(response?.data?.user);
        if (!nextUser) {
          clearActiveClientAuth();
          return;
        }

        setUser(nextUser);
        persistStoredAuth(nextUser);
      } catch (error) {
        if (!active) {
          return;
        }

        if (error?.response?.status === 401) {
          clearActiveClientAuth();
        }
      }
    };

    void syncSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleAuthInvalid = () => {
      clearActiveClientAuth();
    };

    window.addEventListener(MONITORING_AUTH_INVALID_EVENT, handleAuthInvalid);

    return () => {
      window.removeEventListener(MONITORING_AUTH_INVALID_EVENT, handleAuthInvalid);
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (
        event.key !== null &&
        event.key !== SESSION_USER_KEY &&
        event.key !== LOGIN_STATE_KEY &&
        event.key !== USER_ROLE_KEY &&
        event.key !== USER_ID_KEY
      ) {
        return;
      }

      const storedState = readStoredLoginState();
      setUser(storedState.isLoggedIn ? storedState.user : null);
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const hasRole = (roleId) => userHasRole(user, roleId);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!(user && (user.username || user.id)),
        login,
        logout,
        hasRole,
        role: getUserRole(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

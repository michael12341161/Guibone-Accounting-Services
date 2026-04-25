import React, { createContext, useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  api,
  clearStoredAuthToken,
  DEFAULT_SECURITY_SETTINGS,
  MONITORING_AUTH_USER_SYNC_EVENT,
  getStoredAuthToken,
  MONITORING_AUTH_INVALID_EVENT,
  MONITORING_SCHEDULED_BACKUP_EVENT,
  MONITORING_SESSION_EXPIRED_MESSAGE,
  normalizeBackupSchedule,
  processScheduledDatabaseBackup,
  recordUserInteraction,
  normalizeSecuritySettings,
} from "../services/api";
import { getUserRole, hasRole as userHasRole, ROLE_IDS, formatDateTime } from "../utils/helpers";
import { showErrorToast, showSuccessToast } from "../utils/feedback";
import { countUrgentUnfinishedTasks } from "../utils/task_attention";

const SESSION_USER_KEY = "session:user";
const LOGIN_STATE_KEY = "isLoggedIn";
const USER_ROLE_KEY = "user_role";
const USER_ID_KEY = "user_id";
export const LOGIN_SESSION_STORAGE_KEY = "monitoring:login-session-id";
export const DEADLINE_ALERT_SESSION_STORAGE_KEY = "monitoring:deadline-alerts";
export const DEADLINE_REMINDER_SESSION_STORAGE_KEY = "monitoring:deadline-reminder";
export const AUTH_NOTICE_SESSION_STORAGE_KEY = "monitoring:auth-notice";
const AUTH_SYNC_STORAGE_KEY = "monitoring:auth-sync";
const AUTH_SYNC_LOGOUT_TYPE = "logout";
const ONE_MINUTE_MS = 60 * 1000;
const MIN_SERVER_HEARTBEAT_MS = 15 * 1000;
/** Background tabs throttle long timers; poll against a wall-clock deadline while hidden. */
const HIDDEN_IDLE_CHECK_MS = 1000;
const MAX_TIMEOUT_DELAY_MS = 2147483647;

const ROLE_HOME_PATHS = {
  1: "/admin",
  2: "/secretary",
  3: "/accountant",
  4: "/client",
};

export const AuthContext = createContext(null);

function buildScheduledBackupToastDescription(message, nextSchedule, backupName) {
  const nextMessage = String(message ?? "").trim();
  const nextBackupName = String(backupName ?? "").trim();

  if (nextBackupName && nextSchedule?.enabled && nextSchedule?.scheduled_for) {
    return `${nextBackupName} is ready. Next backup: ${formatDateTime(nextSchedule.scheduled_for)}.`;
  }

  if (nextBackupName) {
    return `${nextBackupName} is ready.`;
  }

  if (nextSchedule?.enabled && nextSchedule?.scheduled_for) {
    return nextMessage
      ? `${nextMessage} Next backup: ${formatDateTime(nextSchedule.scheduled_for)}.`
      : `Next backup: ${formatDateTime(nextSchedule.scheduled_for)}.`;
  }

  return nextMessage || "The automatic backup finished successfully.";
}

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

  const normalizedUser = {
    ...user,
    security_settings: normalizeSecuritySettings(user.security_settings),
  };

  if (Object.prototype.hasOwnProperty.call(normalizedUser, "impersonation")) {
    delete normalizedUser.impersonation;
  }

  return normalizedUser;
}

function buildComparableSessionUser(user) {
  const normalizedUser = normalizeSessionUser(user);
  if (!normalizedUser) {
    return null;
  }

  return {
    id: normalizedUser.id ?? null,
    username: normalizedUser.username ?? "",
    role_id: normalizedUser.role_id ?? null,
    client_id: normalizedUser.client_id ?? null,
    email: normalizedUser.email ?? null,
    first_name: normalizedUser.first_name ?? null,
    middle_name: normalizedUser.middle_name ?? null,
    last_name: normalizedUser.last_name ?? null,
    profile_image: normalizedUser.profile_image ?? null,
    password_changed_at: normalizedUser.password_changed_at ?? null,
    password_expires_at: normalizedUser.password_expires_at ?? null,
    password_days_until_expiry: normalizedUser.password_days_until_expiry ?? null,
    registration_source: normalizedUser.registration_source ?? null,
    approval_status: normalizedUser.approval_status ?? null,
    security_settings: normalizeSecuritySettings(normalizedUser.security_settings),
  };
}

function areSessionUsersEquivalent(leftUser, rightUser) {
  return JSON.stringify(buildComparableSessionUser(leftUser)) === JSON.stringify(buildComparableSessionUser(rightUser));
}

function shouldWarnOnLogout(roleId) {
  return [ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(Number(roleId));
}

async function countUrgentUnfinishedTasksForLogout(roleId) {
  if (!shouldWarnOnLogout(roleId)) {
    return 0;
  }

  try {
    const response = await api.get("task_list.php");
    const tasks = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
    return countUrgentUnfinishedTasks(tasks);
  } catch (_) {
    return 0;
  }
}

async function confirmLogoutWithUrgentTasks(roleId) {
  const unfinishedCount = await countUrgentUnfinishedTasksForLogout(roleId);
  if (unfinishedCount > 0) {
    const taskLabel = unfinishedCount === 1 ? "task" : "tasks";
    const result = await Swal.fire({
      icon: "warning",
      title: "Logout Warning",
      html: `<div style="padding:4px 0;line-height:1.6;color:inherit;">\u26A0\uFE0F You have ${unfinishedCount} unfinished ${taskLabel}. Are you sure you want to log out?</div>`,
      showCancelButton: true,
      confirmButtonText: "Logout",
      cancelButtonText: "Stay Logged In",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
    });

    return result.isConfirmed;
  }

  const result = await Swal.fire({
    icon: "question",
    title: "Log out?",
    html: '<div style="padding:4px 0;line-height:1.6;color:inherit;">Are you sure you want to log out?</div>',
    showCancelButton: true,
    confirmButtonText: "Logout",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#2563eb",
    cancelButtonColor: "#64748b",
    reverseButtons: true,
  });

  return result.isConfirmed;
}

function readSessionUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    return raw ? normalizeSessionUser(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

export function readStoredLoginState() {
  try {
    const isLoggedIn = sessionStorage.getItem(LOGIN_STATE_KEY) === "true";
    const roleIdRaw = sessionStorage.getItem(USER_ROLE_KEY);
    const userIdRaw = sessionStorage.getItem(USER_ID_KEY);
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

function queueAuthNotice(message, type = "warning") {
  const normalizedMessage = String(message || "").trim();
  const normalizedType = String(type || "").trim() || "warning";
  if (!normalizedMessage) {
    return;
  }

  try {
    sessionStorage.setItem(
      AUTH_NOTICE_SESSION_STORAGE_KEY,
      JSON.stringify({
        message: normalizedMessage,
        type: normalizedType,
      })
    );
  } catch (_) {}
}

export function consumeAuthNotice() {
  try {
    const raw = sessionStorage.getItem(AUTH_NOTICE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    sessionStorage.removeItem(AUTH_NOTICE_SESSION_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const message = String(parsed.message || "").trim();
    const type = String(parsed.type || "").trim() || "warning";
    if (!message) {
      return null;
    }

    return { message, type };
  } catch (_) {
    return null;
  }
}

function persistStoredAuth(user) {
  if (!user) {
    clearStoredAuth();
    return;
  }

  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(LOGIN_STATE_KEY, "true");
  sessionStorage.setItem(USER_ROLE_KEY, String(user.role_id ?? ""));
  sessionStorage.setItem(USER_ID_KEY, String(user.id ?? ""));
}

export function readSharedLoginSessionKey() {
  try {
    const localValue = String(localStorage.getItem(LOGIN_SESSION_STORAGE_KEY) || "").trim();
    if (localValue) {
      return localValue;
    }
  } catch (_) {}

  try {
    return String(sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

function persistSharedLoginSessionKey(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return;
  }

  try {
    localStorage.setItem(LOGIN_SESSION_STORAGE_KEY, normalizedValue);
  } catch (_) {}

  try {
    sessionStorage.setItem(LOGIN_SESSION_STORAGE_KEY, normalizedValue);
  } catch (_) {}
}

function clearSharedLoginSessionKey() {
  try {
    localStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
  } catch (_) {}

  try {
    sessionStorage.removeItem(LOGIN_SESSION_STORAGE_KEY);
  } catch (_) {}
}

function startLoginSession(user) {
  try {
    const userId = user?.id ?? user?.user_id ?? user?.User_ID ?? "";
    persistSharedLoginSessionKey(`${String(userId || "user")}:${Date.now()}`);
    sessionStorage.removeItem(DEADLINE_ALERT_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(DEADLINE_REMINDER_SESSION_STORAGE_KEY);
  } catch (_) {}
}

function ensureLoginSession(user) {
  try {
    const userId = String(user?.id ?? user?.user_id ?? user?.User_ID ?? "user").trim() || "user";
    const currentSessionKey = readSharedLoginSessionKey();
    if (currentSessionKey.startsWith(`${userId}:`)) {
      try {
        sessionStorage.setItem(LOGIN_SESSION_STORAGE_KEY, currentSessionKey);
      } catch (_) {}
      return;
    }

    startLoginSession(user);
  } catch (_) {}
}

function broadcastAuthSync(type, details = {}) {
  try {
    localStorage.setItem(
      AUTH_SYNC_STORAGE_KEY,
      JSON.stringify({
        type,
        ...details,
        timestamp: Date.now(),
      })
    );
  } catch (_) {}
}

function readAuthSyncPayload(rawValue) {
  try {
    const parsed = JSON.parse(String(rawValue || "").trim());
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      type: String(parsed.type || "").trim(),
      showSessionExpiredNotice: parsed.showSessionExpiredNotice === true,
    };
  } catch (_) {
    return null;
  }
}

function clearStoredAuth() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(LOGIN_STATE_KEY);
  sessionStorage.removeItem(USER_ROLE_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
  clearStoredAuthToken();

  try {
    clearSharedLoginSessionKey();
    sessionStorage.removeItem(DEADLINE_ALERT_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(DEADLINE_REMINDER_SESSION_STORAGE_KEY);
  } catch (_) {}
}

export function getHomePathForRole(roleId) {
  return ROLE_HOME_PATHS[roleId] || "/";
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSessionUser());
  const [isAuthReady, setIsAuthReady] = useState(false);
  const sessionWarningVisibleRef = React.useRef(false);
  const clearActiveClientAuthRef = React.useRef(null);
  /** When true, ignore JWT header user sync (prevents re-login from stale in-flight responses after logout/timeout). */
  const blockJwtUserSyncRef = React.useRef(false);
  const userRef = React.useRef(user);
  const lastServerHeartbeatAtRef = React.useRef(0);
  const activeUserId = user?.id ?? null;
  const currentUserRoleId = getUserRole(user);
  const sessionTimeoutMinutes = Math.max(
    1,
    Number(user?.security_settings?.sessionTimeoutMinutes || DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes)
  );

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  clearActiveClientAuthRef.current = ({
    showSessionExpiredNotice = false,
    broadcastLogout = false,
    skipRemoteLogout = false,
  } = {}) => {
    const hadStoredSession = readStoredLoginState().isLoggedIn || Boolean(getStoredAuthToken());
    const hadAuthenticatedUser = Boolean(user?.id || user?.username || activeUserId !== null);

    if (hadAuthenticatedUser || hadStoredSession) {
      blockJwtUserSyncRef.current = true;
      if (!skipRemoteLogout) {
        void api.post("logout.php").catch(() => null);
      }
    }

    if (showSessionExpiredNotice && (hadAuthenticatedUser || hadStoredSession)) {
      queueAuthNotice(MONITORING_SESSION_EXPIRED_MESSAGE, "warning");
    }

    if (sessionWarningVisibleRef.current) {
      sessionWarningVisibleRef.current = false;
      void Swal.close();
    }

    setUser(null);
    setIsAuthReady(true);

    try {
      clearStoredAuth();
      lastServerHeartbeatAtRef.current = 0;
    } catch (_) {}

    if (broadcastLogout) {
      broadcastAuthSync(AUTH_SYNC_LOGOUT_TYPE, { showSessionExpiredNotice });
    }
  };

  const clearActiveClientAuth = React.useCallback((options = {}) => {
    clearActiveClientAuthRef.current?.(options);
  }, []);

  const login = (nextUser) => {
    const normalizedUser = normalizeSessionUser(nextUser);

    if (sessionWarningVisibleRef.current) {
      sessionWarningVisibleRef.current = false;
      void Swal.close();
    }

    if (normalizedUser) {
      blockJwtUserSyncRef.current = false;
    }

    setUser(normalizedUser);
    setIsAuthReady(true);

    try {
      if (normalizedUser) {
        recordUserInteraction();
        persistStoredAuth(normalizedUser);
        startLoginSession(normalizedUser);
        lastServerHeartbeatAtRef.current = Date.now();
      } else {
        clearStoredAuth();
        lastServerHeartbeatAtRef.current = 0;
      }
    } catch (_) {}
  };

  const logout = async () => {
    const roleId = getUserRole(user);
    const shouldContinue = await confirmLogoutWithUrgentTasks(roleId);
    if (!shouldContinue) {
      return false;
    }

    await api.post("logout.php").catch(() => null);
    clearActiveClientAuth({ broadcastLogout: true, skipRemoteLogout: true });
    return true;
  };

  useEffect(() => {
    if (activeUserId === null) {
      return undefined;
    }

    const timeoutMs = sessionTimeoutMinutes * 60 * 1000;
    const warningWindowMs = getSessionWarningWindowMs(timeoutMs);
    const serverHeartbeatMs = MIN_SERVER_HEARTBEAT_MS;
    const events = ["click", "mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    let idleTimerId = null;
    let warningTimerId = null;
    let heartbeatTimerId = null;
    let active = true;
    let warningVisible = false;
    let sessionCleared = false;
    let heartbeatInFlight = false;
    let idleDeadlineMs = 0;
    let warningDeadlineMs = 0;

    const clearLogoutTimers = () => {
      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
        idleTimerId = null;
      }

      if (warningTimerId !== null) {
        window.clearTimeout(warningTimerId);
        warningTimerId = null;
      }
    };

    const clearHeartbeatTimer = () => {
      if (heartbeatTimerId !== null) {
        window.clearTimeout(heartbeatTimerId);
        heartbeatTimerId = null;
      }
    };

    const clearSession = () => {
      if (sessionCleared) {
        return;
      }

      sessionCleared = true;
      warningVisible = false;
      clearLogoutTimers();
      clearHeartbeatTimer();
      clearActiveClientAuth({ showSessionExpiredNotice: true });
    };

    const sendServerHeartbeat = () => {
      if (!active || sessionCleared || heartbeatInFlight) {
        return;
      }

      clearHeartbeatTimer();

      heartbeatInFlight = true;
      lastServerHeartbeatAtRef.current = Date.now();

      void api
        .get("session_status.php", { monitoringActivity: "active" })
        .then((response) => {
          if (!response?.data?.authenticated) {
            clearActiveClientAuth({ showSessionExpiredNotice: true });
          }
        })
        .catch(() => null)
        .finally(() => {
          heartbeatInFlight = false;
        });
    };

    const refreshServerSession = ({ force = false } = {}) => {
      if (!active || sessionCleared) {
        return;
      }

      const now = Date.now();
      const remainingHeartbeatDelayMs = serverHeartbeatMs - (now - lastServerHeartbeatAtRef.current);

      if (force || remainingHeartbeatDelayMs <= 0) {
        sendServerHeartbeat();
        return;
      }

      if (heartbeatInFlight || heartbeatTimerId !== null) {
        return;
      }

      heartbeatTimerId = window.setTimeout(() => {
        heartbeatTimerId = null;
        sendServerHeartbeat();
      }, remainingHeartbeatDelayMs);
    };

    const armIdleTimer = () => {
      if (!active || sessionCleared) {
        return;
      }

      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
        idleTimerId = null;
      }

      const remainingMs = idleDeadlineMs - Date.now();
      if (remainingMs <= 0) {
        clearSession();
        return;
      }

      const delayMs = Math.min(remainingMs, MAX_TIMEOUT_DELAY_MS);

      if (typeof document !== "undefined" && document.hidden) {
        idleTimerId = window.setTimeout(() => {
          idleTimerId = null;
          armIdleTimer();
        }, Math.min(delayMs, HIDDEN_IDLE_CHECK_MS));
      } else {
        idleTimerId = window.setTimeout(() => {
          idleTimerId = null;
          clearSession();
        }, delayMs);
      }
    };

    const fireSessionWarning = () => {
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
          recordUserInteraction();
          refreshServerSession({ force: true });
          resetTimer();
          return;
        }

        clearSession();
      });
    };

    const armWarningTimer = () => {
      if (!active || sessionCleared || warningWindowMs === null) {
        return;
      }

      if (warningTimerId !== null) {
        window.clearTimeout(warningTimerId);
        warningTimerId = null;
      }

      const remainingMs = warningDeadlineMs - Date.now();
      if (remainingMs <= 0) {
        fireSessionWarning();
        return;
      }

      const delayMs = Math.min(remainingMs, MAX_TIMEOUT_DELAY_MS);

      if (typeof document !== "undefined" && document.hidden) {
        warningTimerId = window.setTimeout(() => {
          warningTimerId = null;
          armWarningTimer();
        }, Math.min(delayMs, HIDDEN_IDLE_CHECK_MS));
      } else {
        warningTimerId = window.setTimeout(() => {
          warningTimerId = null;
          fireSessionWarning();
        }, delayMs);
      }
    };

    const onVisibilityOrPageShow = () => {
      if (!active || sessionCleared) {
        return;
      }
      armIdleTimer();
      if (warningWindowMs !== null && !warningVisible) {
        armWarningTimer();
      }
    };

    const resetTimer = () => {
      if (!active || sessionCleared) {
        return;
      }

      const now = Date.now();
      idleDeadlineMs = now + timeoutMs;
      if (warningWindowMs !== null) {
        warningDeadlineMs = idleDeadlineMs - warningWindowMs;
      }

      clearLogoutTimers();
      armIdleTimer();
      if (warningWindowMs !== null) {
        armWarningTimer();
      }
    };

    const handleActivity = () => {
      if (warningVisible) {
        return;
      }

      recordUserInteraction();
      refreshServerSession();
      resetTimer();
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("focus", handleActivity);
    document.addEventListener("visibilitychange", onVisibilityOrPageShow);
    window.addEventListener("pageshow", onVisibilityOrPageShow);
    resetTimer();

    return () => {
      active = false;
      warningVisible = false;
      clearLogoutTimers();
      clearHeartbeatTimer();
      document.removeEventListener("visibilitychange", onVisibilityOrPageShow);
      window.removeEventListener("pageshow", onVisibilityOrPageShow);
      if (sessionWarningVisibleRef.current) {
        sessionWarningVisibleRef.current = false;
        void Swal.close();
      }

      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("focus", handleActivity);
    };
  }, [activeUserId, clearActiveClientAuth, sessionTimeoutMinutes]);

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
          clearActiveClientAuth({ showSessionExpiredNotice: true });
          return;
        }

        setUser(nextUser);
        persistStoredAuth(nextUser);
        ensureLoginSession(nextUser);
      } catch (error) {
        if (!active) {
          return;
        }

        if (error?.response?.status === 401) {
          clearActiveClientAuth({ showSessionExpiredNotice: true });
          return;
        }
      } finally {
        if (active) {
          setIsAuthReady(true);
        }
      }
    };

    void syncSession();

    return () => {
      active = false;
    };
  }, [clearActiveClientAuth]);

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") {
      return undefined;
    }

    let active = true;
    let inFlight = false;

    const tickScheduledBackup = async () => {
      if (!active || inFlight) {
        return;
      }

      inFlight = true;

      try {
        const response = await processScheduledDatabaseBackup();
        if (!active) {
          return;
        }

        const executed = !!response?.data?.executed;
        const failed = !!response?.data?.failed;
        if (!executed && !failed) {
          return;
        }

        const nextSchedule = normalizeBackupSchedule(response?.data?.schedule);
        const responseMessage = String(response?.data?.message ?? "").trim();

        window.dispatchEvent(
          new CustomEvent(MONITORING_SCHEDULED_BACKUP_EVENT, {
            detail: {
              executed,
              failed,
              message: responseMessage,
              backup: response?.data?.backup || null,
              schedule: nextSchedule,
            },
          })
        );

        if (currentUserRoleId === ROLE_IDS.ADMIN) {
          if (executed) {
            showSuccessToast({
              title: "Automatic backup completed",
              description: buildScheduledBackupToastDescription(
                responseMessage,
                nextSchedule,
                response?.data?.backup?.name
              ),
              id: "monitoring-scheduled-backup-success",
              duration: 3500,
            });
          } else if (failed) {
            const nextRunLabel =
              nextSchedule.enabled && nextSchedule.scheduled_for
                ? ` Next backup: ${formatDateTime(nextSchedule.scheduled_for)}.`
                : "";

            showErrorToast({
              title: "Automatic backup failed",
              description:
                (responseMessage || "The scheduled backup could not be created.") + nextRunLabel,
              id: "monitoring-scheduled-backup-error",
              duration: 4000,
            });
          }
        }
      } catch (_) {
      } finally {
        inFlight = false;
      }
    };

    void tickScheduledBackup();
    const intervalId = window.setInterval(() => {
      void tickScheduledBackup();
    }, ONE_MINUTE_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user?.id, currentUserRoleId]);

  useEffect(() => {
    const handleAuthInvalid = () => {
      clearActiveClientAuth({ showSessionExpiredNotice: true, broadcastLogout: true });
    };

    window.addEventListener(MONITORING_AUTH_INVALID_EVENT, handleAuthInvalid);

    return () => {
      window.removeEventListener(MONITORING_AUTH_INVALID_EVENT, handleAuthInvalid);
    };
  }, [clearActiveClientAuth]);

  useEffect(() => {
    const handleAuthUserSync = (event) => {
      if (blockJwtUserSyncRef.current) {
        return;
      }

      const nextUser = normalizeSessionUser(event?.detail?.user);
      if (!nextUser) {
        return;
      }

      if (areSessionUsersEquivalent(userRef.current, nextUser)) {
        if (!isAuthReady) {
          setIsAuthReady(true);
        }
        return;
      }

      setUser(nextUser);
      setIsAuthReady(true);

      try {
        persistStoredAuth(nextUser);
        ensureLoginSession(nextUser);
      } catch (_) {}
    };

    window.addEventListener(MONITORING_AUTH_USER_SYNC_EVENT, handleAuthUserSync);

    return () => {
      window.removeEventListener(MONITORING_AUTH_USER_SYNC_EVENT, handleAuthUserSync);
    };
  }, [isAuthReady]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event?.key === AUTH_SYNC_STORAGE_KEY) {
        const payload = readAuthSyncPayload(event.newValue);
        if (payload?.type === AUTH_SYNC_LOGOUT_TYPE) {
          clearActiveClientAuth({
            showSessionExpiredNotice: payload.showSessionExpiredNotice,
            broadcastLogout: false,
          });
        }
        return;
      }

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
  }, [clearActiveClientAuth]);

  const hasRole = (roleId) => userHasRole(user, roleId);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthReady,
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

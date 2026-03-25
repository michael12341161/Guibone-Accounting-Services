import React from "react";
import Swal from "sweetalert2";
import { useAuth } from "../hooks/useAuth";
import {
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_SYSTEM_CONFIGURATION,
  fetchAuditLogs,
  fetchSecuritySettings,
  fetchSystemConfiguration,
  saveSecuritySettings,
  saveSystemConfiguration,
} from "../services/api";
import { formatDateTime } from "../utils/helpers";

const SECURITY_FIELDS = [
  {
    key: "maxPasswordLength",
    label: "Maximum Password Length",
    helper: "Default 64. Allowed range: 6 to 256 characters.",
    min: 6,
    max: 256,
  },
  {
    key: "passwordExpiryDays",
    label: "Password Expiry (days)",
    helper: "Default 90. Set to 0 to disable password expiry entirely.",
    min: 0,
    max: 3650,
  },
  {
    key: "sessionTimeoutMinutes",
    label: "Session Timeout (minutes)",
    helper: "Default 30. Users are signed out automatically after inactivity.",
    min: 1,
    max: 1440,
  },
  {
    key: "lockoutAttempts",
    label: "Lockout After Failed Attempts",
    helper: "Default 5. Accounts lock after this many consecutive failed logins.",
    min: 1,
    max: 100,
  },
  {
    key: "lockoutDurationMinutes",
    label: "Lockout Duration (minutes)",
    helper: "Default 15. Locked accounts unlock automatically after this duration.",
    min: 1,
    max: 10080,
  },
];

const SETTINGS_TOAST = {
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
};

const AUDIT_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "all", label: "All time" },
];

const AUDIT_PER_PAGE_OPTIONS = [10, 25, 50, 100];

function parseSecurityNumber(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 10);
}

function validateSecuritySettings(values) {
  const errors = {};
  const maxPasswordLength = parseSecurityNumber(values.maxPasswordLength);
  const passwordExpiryDays = parseSecurityNumber(values.passwordExpiryDays);
  const sessionTimeoutMinutes = parseSecurityNumber(values.sessionTimeoutMinutes);
  const lockoutAttempts = parseSecurityNumber(values.lockoutAttempts);
  const lockoutDurationMinutes = parseSecurityNumber(values.lockoutDurationMinutes);

  if (maxPasswordLength === null || maxPasswordLength < 6 || maxPasswordLength > 256) {
    errors.maxPasswordLength = "Enter a whole number from 6 to 256.";
  }

  if (passwordExpiryDays === null || passwordExpiryDays < 0) {
    errors.passwordExpiryDays = "Enter 0 or any positive whole number.";
  }

  if (sessionTimeoutMinutes === null || sessionTimeoutMinutes <= 0) {
    errors.sessionTimeoutMinutes = "Enter a whole number greater than 0.";
  }

  if (lockoutAttempts === null || lockoutAttempts <= 0) {
    errors.lockoutAttempts = "Enter a whole number greater than 0.";
  }

  if (lockoutDurationMinutes === null || lockoutDurationMinutes <= 0) {
    errors.lockoutDurationMinutes = "Enter a whole number greater than 0.";
  }

  return errors;
}

function buildSecurityPayload(values) {
  return {
    maxPasswordLength: parseSecurityNumber(values.maxPasswordLength) ?? DEFAULT_SECURITY_SETTINGS.maxPasswordLength,
    passwordExpiryDays: parseSecurityNumber(values.passwordExpiryDays) ?? DEFAULT_SECURITY_SETTINGS.passwordExpiryDays,
    sessionTimeoutMinutes:
      parseSecurityNumber(values.sessionTimeoutMinutes) ?? DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes,
    lockoutAttempts: parseSecurityNumber(values.lockoutAttempts) ?? DEFAULT_SECURITY_SETTINGS.lockoutAttempts,
    lockoutDurationMinutes:
      parseSecurityNumber(values.lockoutDurationMinutes) ?? DEFAULT_SECURITY_SETTINGS.lockoutDurationMinutes,
  };
}

function isValidUrlValue(value) {
  try {
    new URL(value);
    return true;
  } catch (_) {
    return false;
  }
}

function validateSystemConfiguration(values) {
  const errors = {};
  const companyName = String(values.companyName ?? "").trim();
  const appBaseUrl = String(values.appBaseUrl ?? "").trim();
  const smtpHost = String(values.smtpHost ?? "").trim();
  const smtpUsername = String(values.smtpUsername ?? "").trim();
  const smtpPassword = String(values.smtpPassword ?? "");
  const smtpPort = parseSecurityNumber(values.smtpPort);

  if (!companyName) {
    errors.companyName = "Company name is required.";
  } else if (companyName.length > 150) {
    errors.companyName = "Company name must be 150 characters or fewer.";
  }

  if (appBaseUrl && !isValidUrlValue(appBaseUrl)) {
    errors.appBaseUrl = "Enter a valid URL like http://localhost:3000.";
  } else if (appBaseUrl.length > 255) {
    errors.appBaseUrl = "Frontend URL must be 255 characters or fewer.";
  }

  if (!smtpHost) {
    errors.smtpHost = "SMTP host is required.";
  } else if (/\s/.test(smtpHost)) {
    errors.smtpHost = "SMTP host cannot contain spaces.";
  } else if (smtpHost.length > 255) {
    errors.smtpHost = "SMTP host must be 255 characters or fewer.";
  }

  if (smtpPort === null || smtpPort <= 0 || smtpPort > 65535) {
    errors.smtpPort = "Enter a whole number from 1 to 65535.";
  }

  if (smtpUsername.length > 255) {
    errors.smtpUsername = "SMTP username must be 255 characters or fewer.";
  }

  if (smtpPassword.length > 255) {
    errors.smtpPassword = "SMTP password must be 255 characters or fewer.";
  }

  if (values.sendClientStatusEmails) {
    if (!smtpUsername) {
      errors.smtpUsername = "SMTP username is required when client status emails are enabled.";
    }
    if (!smtpPassword) {
      errors.smtpPassword = "SMTP password is required when client status emails are enabled.";
    }
  }

  return errors;
}

function buildSystemPayload(values) {
  return {
    companyName: String(values.companyName ?? "").trim() || DEFAULT_SYSTEM_CONFIGURATION.companyName,
    appBaseUrl: String(values.appBaseUrl ?? "").trim(),
    sendClientStatusEmails: !!values.sendClientStatusEmails,
    smtpHost: String(values.smtpHost ?? "").trim() || DEFAULT_SYSTEM_CONFIGURATION.smtpHost,
    smtpPort: parseSecurityNumber(values.smtpPort) ?? DEFAULT_SYSTEM_CONFIGURATION.smtpPort,
    smtpUsername: String(values.smtpUsername ?? "").trim(),
    smtpPassword: String(values.smtpPassword ?? ""),
  };
}

function StatusBanner({ type, children }) {
  if (!children) return null;

  const tone =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return <div className={`rounded-lg border px-4 py-3 text-xs ${tone}`}>{children}</div>;
}

function getAuditActionTone(action) {
  const normalized = String(action ?? "").toLowerCase();

  if (normalized.includes("failed") || normalized.includes("locked") || normalized.includes("blocked")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized.includes("security") || normalized.includes("permissions")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized.includes("login") || normalized.includes("logout") || normalized.includes("returned")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function isLoopbackIpAddress(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "::1" || normalized === "127.0.0.1";
}

function formatAuditIpAddress(value) {
  if (isLoopbackIpAddress(value)) {
    return "Localhost";
  }

  return value || "-";
}

function formatAuditLocation(value, ipAddress) {
  if (value) {
    return value;
  }
  if (isLoopbackIpAddress(ipAddress)) {
    return "Local development";
  }

  return "-";
}

export default function AdminSettings() {
  const { user, login } = useAuth();
  const [showSecurity, setShowSecurity] = React.useState(false);
  const [showBackup, setShowBackup] = React.useState(false);
  const [showSystem, setShowSystem] = React.useState(false);
  const [showAudit, setShowAudit] = React.useState(false);
  const [security, setSecurity] = React.useState(() => ({
    ...DEFAULT_SECURITY_SETTINGS,
    ...(user?.security_settings || {}),
  }));
  const [savedSecurity, setSavedSecurity] = React.useState(() => ({
    ...DEFAULT_SECURITY_SETTINGS,
    ...(user?.security_settings || {}),
  }));
  const [securityErrors, setSecurityErrors] = React.useState({});
  const [securityLoading, setSecurityLoading] = React.useState(false);
  const [securitySaving, setSecuritySaving] = React.useState(false);
  const [securityStatus, setSecurityStatus] = React.useState({ type: "", text: "" });
  const [system, setSystem] = React.useState(DEFAULT_SYSTEM_CONFIGURATION);
  const [savedSystem, setSavedSystem] = React.useState(DEFAULT_SYSTEM_CONFIGURATION);
  const [systemErrors, setSystemErrors] = React.useState({});
  const [systemLoading, setSystemLoading] = React.useState(false);
  const [systemSaving, setSystemSaving] = React.useState(false);
  const [systemStatus, setSystemStatus] = React.useState({ type: "", text: "" });
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [auditError, setAuditError] = React.useState("");
  const [auditSearch, setAuditSearch] = React.useState("");
  const [auditRange, setAuditRange] = React.useState("30d");
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditPerPage, setAuditPerPage] = React.useState(25);
  const [auditRefreshKey, setAuditRefreshKey] = React.useState(0);
  const [auditMeta, setAuditMeta] = React.useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 1,
  });
  const deferredAuditSearch = React.useDeferredValue(auditSearch);

  React.useEffect(() => {
    if (!showSecurity) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const loadSecurity = async () => {
      setSecurityLoading(true);
      setSecurityStatus((current) => (current.type === "success" ? current : { type: "", text: "" }));

      try {
        const response = await fetchSecuritySettings({ signal: controller.signal });
        if (!active) return;

        const nextSettings = response?.data?.settings || DEFAULT_SECURITY_SETTINGS;
        setSecurity(nextSettings);
        setSavedSecurity(nextSettings);
        setSecurityErrors({});
      } catch (error) {
        if (!active) return;

        setSecurityStatus({
          type: "error",
          text: error?.response?.data?.message || "Unable to load security settings right now.",
        });
      } finally {
        if (active) {
          setSecurityLoading(false);
        }
      }
    };

    loadSecurity();

    return () => {
      active = false;
      controller.abort();
    };
  }, [showSecurity]);

  React.useEffect(() => {
    if (!showAudit) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const loadAuditLogs = async () => {
      setAuditLoading(true);
      setAuditError("");

      try {
        const response = await fetchAuditLogs({
          signal: controller.signal,
          params: {
            range: auditRange,
            search: deferredAuditSearch.trim(),
            page: auditPage,
            per_page: auditPerPage,
          },
        });
        if (!active) return;

        setAuditLogs(Array.isArray(response?.data?.logs) ? response.data.logs : []);
        setAuditMeta({
          total: Number(response?.data?.meta?.total || 0),
          page: Number(response?.data?.meta?.page || auditPage),
          per_page: Number(response?.data?.meta?.per_page || auditPerPage),
          total_pages: Math.max(1, Number(response?.data?.meta?.total_pages || 1)),
        });
      } catch (error) {
        if (!active) return;

        setAuditError(error?.response?.data?.message || "Unable to load audit logs right now.");
      } finally {
        if (active) {
          setAuditLoading(false);
        }
      }
    };

    void loadAuditLogs();

    return () => {
      active = false;
      controller.abort();
    };
  }, [showAudit, auditRange, deferredAuditSearch, auditRefreshKey, auditPage, auditPerPage]);

  React.useEffect(() => {
    if (!showSystem) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const loadSystemConfiguration = async () => {
      setSystemLoading(true);
      setSystemStatus((current) => (current.type === "success" ? current : { type: "", text: "" }));

      try {
        const response = await fetchSystemConfiguration({ signal: controller.signal });
        if (!active) return;

        const nextSettings = response?.data?.settings || DEFAULT_SYSTEM_CONFIGURATION;
        setSystem(nextSettings);
        setSavedSystem(nextSettings);
        setSystemErrors({});
      } catch (error) {
        if (!active) return;

        setSystemStatus({
          type: "error",
          text: error?.response?.data?.message || "Unable to load system configuration right now.",
        });
      } finally {
        if (active) {
          setSystemLoading(false);
        }
      }
    };

    void loadSystemConfiguration();

    return () => {
      active = false;
      controller.abort();
    };
  }, [showSystem]);

  const updateSecurity = (key) => (event) => {
    const sanitized = event.target.value.replace(/[^\d]/g, "");

    setSecurity((current) => ({
      ...current,
      [key]: sanitized === "" ? "" : Number.parseInt(sanitized, 10),
    }));
    setSecurityErrors((current) => {
      if (!current[key]) return current;

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
    setSecurityStatus((current) => (current.type ? { type: "", text: "" } : current));
  };

  const updateSystemText = (key) => (event) => {
    const nextValue = key === "smtpPassword" ? event.target.value : event.target.value.trimStart();

    setSystem((current) => ({
      ...current,
      [key]: nextValue,
    }));
    setSystemErrors((current) => {
      if (!current[key]) return current;

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
    setSystemStatus((current) => (current.type ? { type: "", text: "" } : current));
  };

  const updateSystemPort = (event) => {
    const sanitized = event.target.value.replace(/[^\d]/g, "");

    setSystem((current) => ({
      ...current,
      smtpPort: sanitized === "" ? "" : Number.parseInt(sanitized, 10),
    }));
    setSystemErrors((current) => {
      if (!current.smtpPort) return current;

      const nextErrors = { ...current };
      delete nextErrors.smtpPort;
      return nextErrors;
    });
    setSystemStatus((current) => (current.type ? { type: "", text: "" } : current));
  };

  const updateSystemToggle = (key) => (event) => {
    const checked = !!event.target.checked;

    setSystem((current) => ({
      ...current,
      [key]: checked,
    }));
    setSystemErrors((current) => {
      if (key !== "sendClientStatusEmails" && !current[key]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      if (!checked && key === "sendClientStatusEmails") {
        delete nextErrors.smtpUsername;
        delete nextErrors.smtpPassword;
      }
      return nextErrors;
    });
    setSystemStatus((current) => (current.type ? { type: "", text: "" } : current));
  };

  const handleSaveSecurity = async () => {
    const errors = validateSecuritySettings(security);
    if (Object.keys(errors).length > 0) {
      setSecurityErrors(errors);
      setSecurityStatus({
        type: "error",
        text: "Fix the highlighted fields before saving.",
      });
      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "error",
        title: errors.sessionTimeoutMinutes ? "Invalid session timeout" : "Unable to save settings",
        text: errors.sessionTimeoutMinutes || "Fix the highlighted fields before saving.",
      });
      return;
    }

    setSecuritySaving(true);
    setSecurityStatus({ type: "", text: "" });

    try {
      const payload = buildSecurityPayload(security);
      const response = await saveSecuritySettings(payload);
      const savedSettings = response?.data?.settings || payload;
      const timeoutChanged = savedSettings.sessionTimeoutMinutes !== savedSecurity.sessionTimeoutMinutes;
      const timeoutLabel = `${savedSettings.sessionTimeoutMinutes} minute${
        savedSettings.sessionTimeoutMinutes === 1 ? "" : "s"
      }`;

      setSecurity(savedSettings);
      setSavedSecurity(savedSettings);
      setSecurityErrors({});
      setSecurityStatus({
        type: "success",
        text: response?.data?.message || "Security settings saved successfully.",
      });

      if (user) {
        login({
          ...user,
          security_settings: savedSettings,
        });
      }

      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "success",
        title: timeoutChanged ? "Session timeout updated" : "Security settings saved",
        text: timeoutChanged
          ? `Users will now be signed out after ${timeoutLabel} of inactivity.`
          : response?.data?.message || "Security settings saved successfully.",
      });
    } catch (error) {
      setSecurityErrors(error?.response?.data?.errors || {});
      setSecurityStatus({
        type: "error",
        text: error?.response?.data?.message || "Unable to save security settings.",
      });
      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "error",
        title: "Unable to save settings",
        text: error?.response?.data?.message || "Unable to save security settings.",
      });
    } finally {
      setSecuritySaving(false);
    }
  };

  const handleSaveSystem = async () => {
    const errors = validateSystemConfiguration(system);
    if (Object.keys(errors).length > 0) {
      setSystemErrors(errors);
      setSystemStatus({
        type: "error",
        text: "Fix the highlighted fields before saving.",
      });
      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "error",
        title: "Unable to save system configuration",
        text: Object.values(errors)[0] || "Fix the highlighted fields before saving.",
      });
      return;
    }

    setSystemSaving(true);
    setSystemStatus({ type: "", text: "" });

    try {
      const payload = buildSystemPayload(system);
      const response = await saveSystemConfiguration(payload);
      const savedSettings = response?.data?.settings || payload;
      const statusEmailsChanged = savedSettings.sendClientStatusEmails !== savedSystem.sendClientStatusEmails;

      setSystem(savedSettings);
      setSavedSystem(savedSettings);
      setSystemErrors({});
      setSystemStatus({
        type: "success",
        text: response?.data?.message || "System configuration saved successfully.",
      });

      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "success",
        title: "System configuration saved",
        text: statusEmailsChanged
          ? savedSettings.sendClientStatusEmails
            ? "Client approval and rejection emails are now enabled."
            : "Client approval and rejection emails are now disabled."
          : response?.data?.message || "System configuration saved successfully.",
      });
    } catch (error) {
      setSystemErrors(error?.response?.data?.errors || {});
      setSystemStatus({
        type: "error",
        text: error?.response?.data?.message || "Unable to save system configuration.",
      });
      void Swal.fire({
        ...SETTINGS_TOAST,
        icon: "error",
        title: "Unable to save system configuration",
        text: error?.response?.data?.message || "Unable to save system configuration.",
      });
    } finally {
      setSystemSaving(false);
    }
  };

  const cards = [
    {
      key: "security",
      title: "Security Settings",
      desc: "Password policy, session timeout, lockout rules, and account protection.",
      iconBg: "bg-rose-50 text-rose-600",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3c2.761 0 5 2.239 5 5v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h1V8c0-2.761 2.239-5 5-5Zm0 2a3 3 0 0 0-3 3v2h6V8a3 3 0 0 0-3-3Z"
          />
        </svg>
      ),
      action: "Manage",
      onClick: () => setShowSecurity(true),
    },
    {
      key: "backup",
      title: "Backup & Data",
      desc: "Database backups, exports and data lifecycle.",
      iconBg: "bg-amber-50 text-amber-600",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 1-6.364 2.636M12 3v6m0 0h6" />
        </svg>
      ),
      action: "Open",
      onClick: () => setShowBackup(true),
    },
    {
      key: "system",
      title: "System Configuration",
      desc: "General preferences, email, notifications and more.",
      iconBg: "bg-sky-50 text-sky-600",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317a1.5 1.5 0 0 1 3.35 0l.144 1.157a6.971 6.971 0 0 1 1.838.763l1.03-.6a1.5 1.5 0 1 1 1.5 2.598l-1.03.595c.24.588.403 1.216.482 1.872l1.19.2a1.5 1.5 0 1 1-.5 2.957l-1.194-.2a7.024 7.024 0 0 1-1.01 1.742l.72.973a1.5 1.5 0 1 1-2.42 1.76l-.724-.978a6.97 6.97 0 0 1-1.93.443l-.145 1.153a1.5 1.5 0 1 1-2.98-.374l.144-1.157a6.97 6.97 0 0 1-1.838-.763l-1.03.6a1.5 1.5 0 0 1-1.5-2.598l1.03-.595A6.97 6.97 0 0 1 5.1 11.56l-1.19-.2a1.5 1.5 0 0 1 .5-2.957l1.194.2c.245-.64.585-1.235 1.01-1.742l-.72-.973a1.5 1.5 0 0 1 2.42-1.76l.724.978c.615-.22 1.26-.37 1.93-.443Z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      action: "Configure",
      onClick: () => setShowSystem(true),
    },
    {
      key: "audit",
      title: "Audit Logs",
      desc: "Track user activity, changes and system events.",
      iconBg: "bg-emerald-50 text-emerald-600",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M4 6h16M4 10h8M4 14h6" />
        </svg>
      ),
      action: "View",
      onClick: () => setShowAudit(true),
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Administration and configuration</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">{card.title}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{card.desc}</p>
              </div>
              <div className={`grid h-9 w-9 place-items-center rounded-full ${card.iconBg}`} aria-hidden>
                {card.icon}
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={card.onClick}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {card.action}
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showSecurity ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSecurity(false)} />
          <div className="relative z-10 grid h-full w-full place-items-center p-4">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Security Settings</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Save the password, expiry, timeout, and lockout rules used by the system.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSecurity(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                <StatusBanner type={securityStatus.type}>{securityStatus.text}</StatusBanner>

                {securityLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Loading security settings...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {SECURITY_FIELDS.map((field) => (
                      <div
                        key={field.key}
                        className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start"
                      >
                        <div>
                          <label className="block text-sm font-semibold text-slate-800">{field.label}</label>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{field.helper}</p>
                        </div>

                        <div>
                          <input
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={1}
                            value={security[field.key]}
                            onChange={updateSecurity(field.key)}
                            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              securityErrors[field.key]
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                          />
                          {securityErrors[field.key] ? (
                            <p className="mt-1 text-xs text-rose-600">{securityErrors[field.key]}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowSecurity(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveSecurity}
                  disabled={securityLoading || securitySaving}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {securitySaving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBackup ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBackup(false)} />
          <div className="relative z-10 grid h-full w-full place-items-center p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Backup & Data</h3>
                <button
                  type="button"
                  onClick={() => setShowBackup(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-700">Run Backup</div>
                  <p className="mt-1 text-xs text-slate-500">Create a full database backup now.</p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    onClick={() => {
                      try {
                        console.log("Starting backup...");
                      } catch (_) {}
                    }}
                  >
                    Start Backup
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-700">Export Data</div>
                  <p className="mt-1 text-xs text-slate-500">Download a CSV/JSON export of selected entities.</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-700">Import Data</div>
                  <p className="mt-1 text-xs text-slate-500">Restore from a previous backup or upload records.</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowBackup(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showSystem ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSystem(false)} />
          <div className="relative z-10 grid h-full w-full place-items-center p-4">
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">System Configuration</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Manage the organization name, frontend URL, SMTP delivery, and client status emails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSystem(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <StatusBanner type={systemStatus.type}>{systemStatus.text}</StatusBanner>

                {systemLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Loading system configuration...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-slate-800">General Preferences</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          These values are reused in client emails and login links.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700">Company Name</label>
                          <input
                            type="text"
                            value={system.companyName}
                            onChange={updateSystemText("companyName")}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.companyName
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                            placeholder="Guibone Accounting Services (GAS)"
                          />
                          <p className="mt-1 text-xs text-slate-500">Shown as the sender name in outgoing emails.</p>
                          {systemErrors.companyName ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.companyName}</p>
                          ) : null}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700">Frontend URL</label>
                          <input
                            type="url"
                            value={system.appBaseUrl}
                            onChange={updateSystemText("appBaseUrl")}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.appBaseUrl
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                            placeholder="http://localhost:3000"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Used for the login button inside approval emails. Leave blank to auto-detect.
                          </p>
                          {systemErrors.appBaseUrl ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.appBaseUrl}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-slate-800">Notifications</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          Control the automatic emails sent when client registrations are approved or rejected.
                        </p>
                      </div>

                      <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-slate-800">Send Client Status Emails</div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Uses the SMTP settings below for approval and rejection emails. Password reset still uses the
                            same SMTP credentials.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={!!system.sendClientStatusEmails}
                          onChange={updateSystemToggle("sendClientStatusEmails")}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                        />
                      </label>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-slate-800">Email (SMTP)</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          These credentials are used by the forgot-password flow and any enabled client status emails.
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-700">SMTP Host</label>
                          <input
                            type="text"
                            value={system.smtpHost}
                            onChange={updateSystemText("smtpHost")}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.smtpHost
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                            placeholder="smtp.gmail.com"
                          />
                          {systemErrors.smtpHost ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.smtpHost}</p>
                          ) : null}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700">SMTP Port</label>
                          <input
                            type="number"
                            min={1}
                            max={65535}
                            step={1}
                            value={system.smtpPort}
                            onChange={updateSystemPort}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.smtpPort
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                          />
                          {systemErrors.smtpPort ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.smtpPort}</p>
                          ) : null}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700">SMTP Username</label>
                          <input
                            type="text"
                            value={system.smtpUsername}
                            onChange={updateSystemText("smtpUsername")}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.smtpUsername
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                            placeholder="your-email@example.com"
                          />
                          {systemErrors.smtpUsername ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.smtpUsername}</p>
                          ) : null}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700">SMTP Password</label>
                          <input
                            type="password"
                            value={system.smtpPassword}
                            onChange={updateSystemText("smtpPassword")}
                            className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${
                              systemErrors.smtpPassword
                                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                                : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                            }`}
                            placeholder="App password or SMTP password"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Use an app password if your provider requires it.
                          </p>
                          {systemErrors.smtpPassword ? (
                            <p className="mt-1 text-xs text-rose-600">{systemErrors.smtpPassword}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowSystem(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveSystem}
                  disabled={systemLoading || systemSaving}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {systemSaving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showAudit ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAudit(false)} />
          <div className="relative z-10 grid h-full w-full place-items-center p-4">
            <div className="w-full max-w-6xl rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Audit Logs</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Review login activity, security updates, and other tracked system events.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAudit(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-600">
                    {auditLoading
                      ? "Loading audit activity..."
                      : `${auditMeta.total} log entr${auditMeta.total === 1 ? "y" : "ies"} found`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(event) => {
                        setAuditSearch(event.target.value);
                        setAuditPage(1);
                      }}
                      placeholder="Search user, action, device..."
                      className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                    />
                    <select
                      value={auditRange}
                      onChange={(event) => {
                        setAuditRange(event.target.value);
                        setAuditPage(1);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                    >
                      {AUDIT_RANGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={auditPerPage}
                      onChange={(event) => {
                        setAuditPerPage(Number(event.target.value));
                        setAuditPage(1);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                    >
                      {AUDIT_PER_PAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option} / page
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAuditRefreshKey((value) => value + 1)}
                      disabled={auditLoading}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {auditError ? (
                  <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                    {auditError}
                  </div>
                ) : null}

                {auditLoading && auditLogs.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Loading audit logs...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No audit logs found for the selected filters.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="max-h-[55vh] overflow-auto">
                    <table className="min-w-full table-fixed text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-44 px-3 py-2 text-left font-medium align-middle">Time</th>
                          <th className="w-44 px-3 py-2 text-left font-medium align-middle">User</th>
                          <th className="w-48 px-3 py-2 text-left font-medium align-middle">Action</th>
                          <th className="w-36 px-3 py-2 text-left font-medium align-middle">IP Address</th>
                          <th className="w-44 px-3 py-2 text-left font-medium align-middle">Location</th>
                          <th className="w-44 px-3 py-2 text-left font-medium align-middle">Device</th>
                          <th className="w-40 px-3 py-2 text-left font-medium align-middle">Browser</th>
                          <th className="w-40 px-3 py-2 text-left font-medium align-middle">OS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="px-3 py-2 align-middle text-slate-700">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <div className="font-medium text-slate-700">{log.display_name || "Unknown user"}</div>
                              {log.username ? <div className="text-xs text-slate-500">@{log.username}</div> : null}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAuditActionTone(
                                  log.action
                                )}`}
                              >
                                {log.action || "-"}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-middle font-mono text-xs text-slate-600">
                              {formatAuditIpAddress(log.ip_address)}
                            </td>
                            <td className="px-3 py-2 align-middle text-slate-600">
                              {formatAuditLocation(log.location, log.ip_address)}
                            </td>
                            <td className="px-3 py-2 align-middle text-slate-600">{log.device || "-"}</td>
                            <td className="px-3 py-2 align-middle text-slate-600">{log.browser || "-"}</td>
                            <td className="px-3 py-2 align-middle text-slate-600">{log.os || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-slate-600">
                        {auditMeta.total > 0
                          ? `Showing ${(auditMeta.page - 1) * auditMeta.per_page + 1}-${Math.min(
                              auditMeta.page * auditMeta.per_page,
                              auditMeta.total
                            )} of ${auditMeta.total}`
                          : "Showing 0 of 0"}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAuditPage((current) => Math.max(1, current - 1))}
                          disabled={auditLoading || auditMeta.page <= 1}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Previous
                        </button>
                        <div className="text-xs text-slate-600">
                          Page {auditMeta.page} of {auditMeta.total_pages}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAuditPage((current) => Math.min(auditMeta.total_pages, current + 1))}
                          disabled={auditLoading || auditMeta.page >= auditMeta.total_pages}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setShowAudit(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

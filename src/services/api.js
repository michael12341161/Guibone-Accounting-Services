import axios from "axios";
import { mergePermissions } from "../utils/module_permissions";

// Configure to hit the PHP backend served by XAMPP.
// Adjust this baseURL if your Apache virtual host differs.
const baseURL = "http://localhost/Monitoring/monitoring/backend/api/";

// Default API client. Authenticated requests use the PHP session cookie.
export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Session-aware API client (cookies enabled). Use ONLY for password reset flow.
export const apiSession = axios.create({
  baseURL,
  withCredentials: true,
});

export function normalizeServiceOptions(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const names = rows
    .map((entry) => (typeof entry === "string" ? entry : entry?.Name || entry?.name))
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  return Array.from(new Set(names)).map((name) => ({ name }));
}

export async function fetchAvailableServices(clientId, config = {}) {
  const trimmedClientId = String(clientId ?? "").trim();
  const response = await api.get("services_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      ...(trimmedClientId ? { client_id: trimmedClientId } : {}),
    },
  });

  return {
    ...response,
    data: {
      ...response?.data,
      services: normalizeServiceOptions(response?.data?.services || response?.data),
    },
  };
}

export const DEFAULT_SECURITY_SETTINGS = Object.freeze({
  maxPasswordLength: 64,
  passwordExpiryDays: 90,
  sessionTimeoutMinutes: 30,
  lockoutAttempts: 5,
  lockoutDurationMinutes: 15,
});

export const DEFAULT_SYSTEM_CONFIGURATION = Object.freeze({
  companyName: "Guibone Accounting Services (GAS)",
  appBaseUrl: "",
  sendClientStatusEmails: false,
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  smtpUsername: "",
  smtpPassword: "",
});

function parseIntegerSetting(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const normalized = String(value ?? "").trim();
  if (!/^-?\d+$/.test(normalized)) {
    return fallback;
  }

  return Number.parseInt(normalized, 10);
}

function parseStringSetting(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized !== "" ? normalized : fallback;
}

function parseBooleanSetting(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function normalizeSecuritySettings(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    maxPasswordLength: parseIntegerSetting(source.maxPasswordLength, DEFAULT_SECURITY_SETTINGS.maxPasswordLength),
    passwordExpiryDays: parseIntegerSetting(source.passwordExpiryDays, DEFAULT_SECURITY_SETTINGS.passwordExpiryDays),
    sessionTimeoutMinutes: parseIntegerSetting(
      source.sessionTimeoutMinutes,
      DEFAULT_SECURITY_SETTINGS.sessionTimeoutMinutes
    ),
    lockoutAttempts: parseIntegerSetting(source.lockoutAttempts, DEFAULT_SECURITY_SETTINGS.lockoutAttempts),
    lockoutDurationMinutes: parseIntegerSetting(
      source.lockoutDurationMinutes,
      DEFAULT_SECURITY_SETTINGS.lockoutDurationMinutes
    ),
  };
}

export function normalizeSystemConfiguration(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    companyName: parseStringSetting(source.companyName, DEFAULT_SYSTEM_CONFIGURATION.companyName),
    appBaseUrl: String(source.appBaseUrl ?? "").trim(),
    sendClientStatusEmails: parseBooleanSetting(
      source.sendClientStatusEmails,
      DEFAULT_SYSTEM_CONFIGURATION.sendClientStatusEmails
    ),
    smtpHost: parseStringSetting(source.smtpHost, DEFAULT_SYSTEM_CONFIGURATION.smtpHost),
    smtpPort: parseIntegerSetting(source.smtpPort, DEFAULT_SYSTEM_CONFIGURATION.smtpPort),
    smtpUsername: String(source.smtpUsername ?? "").trim(),
    smtpPassword: String(source.smtpPassword ?? ""),
  };
}

export async function fetchSecuritySettings(config = {}) {
  const response = await api.get("user_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      scope: "security_settings",
    },
  });

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSecuritySettings(response?.data?.settings),
    },
  };
}

export async function saveSecuritySettings(settings, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "save_security_settings",
      settings,
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSecuritySettings(response?.data?.settings),
    },
  };
}

export async function fetchSystemConfiguration(config = {}) {
  const response = await api.get("user_list.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      scope: "system_configuration",
    },
  });

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

export async function saveSystemConfiguration(settings, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "save_system_configuration",
      settings,
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeSystemConfiguration(response?.data?.settings),
    },
  };
}

export async function fetchAuditLogs(config = {}) {
  const response = await api.get("audit_logs.php", {
    ...config,
    params: {
      range: "30d",
      page: 1,
      per_page: 25,
      ...(config?.params || {}),
    },
  });

  return response;
}

export async function fetchModulePermissions(config = {}) {
  const response = await api.get("module_permissions.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      permissions: mergePermissions(response?.data?.permissions),
    },
  };
}

export async function saveModulePermissions(permissions, config = {}) {
  const response = await api.post(
    "module_permissions.php",
    {
      action: "save_module_permissions",
      permissions,
    },
    config
  );

  return {
    ...response,
    data: {
      ...response.data,
      permissions: mergePermissions(response?.data?.permissions),
    },
  };
}

export async function requestModuleAccess(moduleKey, moduleLabel, config = {}) {
  const response = await api.post(
    "module_access_request.php",
    {
      module_key: moduleKey,
      module_label: moduleLabel,
    },
    config
  );

  return response;
}

export async function switchToClientAccount(clientId, config = {}) {
  const response = await api.post(
    "account_switch.php",
    {
      action: "start_client_view",
      client_id: clientId,
    },
    config
  );

  return response;
}

export async function restoreOriginalAccount(config = {}) {
  const response = await api.post(
    "account_switch.php",
    {
      action: "restore_original",
    },
    config
  );

  return response;
}

export function resolveBackendAssetUrl(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const cleanPath = normalized.replace(/^\/+/, "");
  const base = String(baseURL).replace(/api\/?$/, "");
  return `${base}${cleanPath}`;
}

import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { mergePermissions } from "../utils/module_permissions";
import { DEFAULT_TASK_WORKLOAD_SETTINGS, normalizeTaskWorkloadSettings } from "../utils/task_workload";

// Configure to hit the PHP backend served by XAMPP.
// Adjust this baseURL if your Apache virtual host differs.
const baseURL = "http://localhost/Monitoring/monitoring/backend/api/";
const AUTH_TOKEN_KEY = "auth:jwt";
const JWT_REFRESH_HEADER = "x-monitoring-jwt";
export const MONITORING_AUTH_INVALID_EVENT = "monitoring:auth-invalid";
export const MONITORING_SYSTEM_CONFIG_UPDATED_EVENT = "monitoring:system-config-updated";

function dispatchAuthInvalidEvent() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(MONITORING_AUTH_INVALID_EVENT));
}

function readTokenStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function clearStoredAuthToken() {
  const storage = readTokenStorage();
  storage?.removeItem(AUTH_TOKEN_KEY);
}

export function storeAuthToken(token) {
  const normalized = String(token ?? "").trim();
  if (!normalized) {
    clearStoredAuthToken();
    return;
  }

  const storage = readTokenStorage();
  storage?.setItem(AUTH_TOKEN_KEY, normalized);
}

function isExpiredToken(token) {
  try {
    const decoded = jwtDecode(token);
    const exp = Number(decoded?.exp ?? 0);
    if (!Number.isFinite(exp) || exp <= 0) {
      return true;
    }

    return exp * 1000 <= Date.now() + 5000;
  } catch (_) {
    return true;
  }
}

export function getStoredAuthToken() {
  const storage = readTokenStorage();
  const token = String(storage?.getItem(AUTH_TOKEN_KEY) ?? "").trim();
  if (!token) {
    return "";
  }

  if (isExpiredToken(token)) {
    clearStoredAuthToken();
    return "";
  }

  return token;
}

function syncTokenFromResponse(response) {
  const token = String(response?.headers?.[JWT_REFRESH_HEADER] ?? "").trim();
  if (token) {
    storeAuthToken(token);
  }

  return response;
}

function attachJwtAuthorization(config) {
  const nextConfig = { ...config };
  const headers = { ...(nextConfig.headers || {}) };
  const token = getStoredAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    delete headers.Authorization;
  }

  nextConfig.headers = headers;
  return nextConfig;
}

// Authenticated requests use JWT bearer headers with PHP sessions kept for compatibility flows.
export const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Session-aware API client (cookies enabled). Use ONLY for password reset flow.
export const apiSession = axios.create({
  baseURL,
  withCredentials: true,
});

[api, apiSession].forEach((client) => {
  client.interceptors.request.use(attachJwtAuthorization);
  client.interceptors.response.use(
    (response) => syncTokenFromResponse(response),
    (error) => {
      if (error?.response) {
        syncTokenFromResponse(error.response);
      }

      if (error?.response?.status === 401) {
        clearStoredAuthToken();
        dispatchAuthInvalidEvent();
      }

      return Promise.reject(error);
    }
  );
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
  allowClientSelfSignup: true,
  allowClientAppointments: true,
  allowClientConsultations: true,
  supportEmail: "",
  systemNotice: "",
  taskReminderIntervalHours: 4,
  taskReminderIntervalMinutes: 0,
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
    allowClientSelfSignup: parseBooleanSetting(
      source.allowClientSelfSignup,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientSelfSignup
    ),
    allowClientAppointments: parseBooleanSetting(
      source.allowClientAppointments,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientAppointments
    ),
    allowClientConsultations: parseBooleanSetting(
      source.allowClientConsultations,
      DEFAULT_SYSTEM_CONFIGURATION.allowClientConsultations
    ),
    supportEmail: String(source.supportEmail ?? "").trim(),
    systemNotice: String(source.systemNotice ?? "").trim(),
    taskReminderIntervalHours: parseIntegerSetting(
      source.taskReminderIntervalHours,
      DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalHours
    ),
    taskReminderIntervalMinutes: parseIntegerSetting(
      source.taskReminderIntervalMinutes,
      DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalMinutes
    ),
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

export { DEFAULT_TASK_WORKLOAD_SETTINGS, normalizeTaskWorkloadSettings };

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

export async function fetchPublicSystemConfiguration(config = {}) {
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

export async function sendSystemTestEmail({ settings, recipientEmail }, config = {}) {
  const response = await api.post(
    "user_update.php",
    {
      action: "send_system_test_email",
      settings,
      recipient_email: String(recipientEmail ?? "").trim(),
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

export async function fetchTaskWorkloadSettings(config = {}) {
  const response = await api.get("task_workload_settings.php", config);

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeTaskWorkloadSettings(response?.data?.settings),
    },
  };
}

export async function saveTaskWorkloadSettings(settings, config = {}) {
  const response = await api.post("task_workload_settings.php", settings, config);

  return {
    ...response,
    data: {
      ...response.data,
      settings: normalizeTaskWorkloadSettings(response?.data?.settings),
    },
  };
}

export async function fetchBackupDataOverview(config = {}) {
  return api.get("backup_data.php", config);
}

export async function createDatabaseBackup(config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "create_backup",
    },
    config
  );
}

export async function cleanupDatabaseBackups(payload = {}, config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "cleanup_backups",
      ...payload,
    },
    config
  );
}

export async function deleteDatabaseBackup(filename, config = {}) {
  return api.post(
    "backup_data.php",
    {
      action: "delete_backup",
      filename,
    },
    config
  );
}

export async function downloadDatabaseBackup(filename, config = {}) {
  return api.get("backup_data.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      download_backup: filename,
    },
    responseType: "blob",
  });
}

export async function exportDatabaseTable(tableName, format = "csv", config = {}) {
  return api.get("backup_data.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      export_table: tableName,
      format,
    },
    responseType: "blob",
  });
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

export async function fetchCertificateTemplates(config = {}) {
  return api.get("certificate_templates.php", config);
}

export async function saveCertificateTemplate(payload, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "save_template",
      ...payload,
    },
    config
  );
}

export async function saveSelectedCertificateTemplates(selectedTemplateIds, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "save_selected_templates",
      selected_template_ids: Array.isArray(selectedTemplateIds) ? selectedTemplateIds : [],
    },
    config
  );
}

export async function deleteCertificateTemplate(templateId, config = {}) {
  return api.post(
    "certificate_templates.php",
    {
      action: "delete_template",
      template_id: templateId,
    },
    config
  );
}

export async function fetchCertificateRecord(params = {}, config = {}) {
  return api.get("certificate_view.php", {
    ...config,
    params: {
      ...(config?.params || {}),
      ...(params && typeof params === "object" ? params : {}),
    },
  });
}

export function resolveBackendAssetUrl(path) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const cleanPath = normalized.replace(/^\/+/, "");
  const base = String(baseURL).replace(/api\/?$/, "");
  return `${base}${cleanPath}`;
}

import React from "react";
import AuditLogsSection from "./Audit_Logs";
import BackupSection, { formatBytes, getBackupScheduleFrequencyLabel } from "./Backup";
import RateLimitingSection from "./Rate_Limiting";
import SecuritySettingsSection from "./Security_Settings";
import TempMailBlockerSection from "./Tempmail_blocker";
import { Ban } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  cleanupDatabaseBackups,
  createDatabaseBackup,
  DEFAULT_BACKUP_SCHEDULE,
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_SYSTEM_CONFIGURATION,
  deleteDatabaseBackup,
  downloadDatabaseBackup,
  exportDatabaseTable,
  fetchAuditLogs,
  fetchBackupDataOverview,
  fetchSecuritySettings,
  fetchSystemConfiguration,
  MONITORING_SCHEDULED_BACKUP_EVENT,
  MONITORING_SYSTEM_CONFIG_UPDATED_EVENT,
  normalizeBackupSchedule,
  saveBackupSchedule,
  saveSecuritySettings,
  saveSystemConfiguration,
  sendSystemTestEmail,
} from "../services/api";
import { formatDateTime } from "../utils/helpers";
import { showDangerConfirmDialog, showErrorToast, showSuccessToast, useErrorToastState } from "../utils/feedback";

const AUDIT_LOGS_PER_PAGE = 10;

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
    loginVerificationEnabled:
      typeof values.loginVerificationEnabled === "boolean"
        ? values.loginVerificationEnabled
        : DEFAULT_SECURITY_SETTINGS.loginVerificationEnabled,
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

function isValidEmailValue(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function validateSystemConfiguration(values) {
  const errors = {};
  const companyName = String(values.companyName ?? "").trim();
  const appBaseUrl = String(values.appBaseUrl ?? "").trim();
  const supportEmail = String(values.supportEmail ?? "").trim();
  const systemNotice = String(values.systemNotice ?? "").trim();
  const taskReminderIntervalHours = parseSecurityNumber(values.taskReminderIntervalHours);
  const taskReminderIntervalMinutes = parseSecurityNumber(values.taskReminderIntervalMinutes);
  const rateLimitMaxRequests = parseSecurityNumber(values.rateLimitMaxRequests);
  const rateLimitWindowSeconds = parseSecurityNumber(values.rateLimitWindowSeconds);
  const rateLimitLoginMaxRequests = parseSecurityNumber(values.rateLimitLoginMaxRequests);
  const rateLimitLoginWindowSeconds = parseSecurityNumber(values.rateLimitLoginWindowSeconds);
  const rateLimitMessage = String(values.rateLimitMessage ?? "").trim();
  const rateLimitLoginMessage = String(values.rateLimitLoginMessage ?? "").trim();
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

  if (supportEmail && !isValidEmailValue(supportEmail)) {
    errors.supportEmail = "Enter a valid support email address.";
  } else if (supportEmail.length > 255) {
    errors.supportEmail = "Support email must be 255 characters or fewer.";
  }

  if (systemNotice.length > 500) {
    errors.systemNotice = "System notice must be 500 characters or fewer.";
  }

  if (taskReminderIntervalHours === null || taskReminderIntervalHours < 0 || taskReminderIntervalHours > 24) {
    errors.taskReminderIntervalHours = "Enter a whole number from 0 to 24.";
  }

  if (taskReminderIntervalMinutes === null || taskReminderIntervalMinutes < 0 || taskReminderIntervalMinutes > 59) {
    errors.taskReminderIntervalMinutes = "Enter a whole number from 0 to 59.";
  }

  if (taskReminderIntervalHours !== null && taskReminderIntervalMinutes !== null) {
    const totalReminderMinutes = taskReminderIntervalHours * 60 + taskReminderIntervalMinutes;
    if (totalReminderMinutes < 1) {
      errors.taskReminderIntervalHours = "Reminder interval must be at least 1 minute.";
      errors.taskReminderIntervalMinutes = "Reminder interval must be at least 1 minute.";
    } else if (totalReminderMinutes > 1440) {
      errors.taskReminderIntervalHours = "Reminder interval cannot exceed 24 hours.";
      errors.taskReminderIntervalMinutes = "Reminder interval cannot exceed 24 hours.";
    }
  }

  if (rateLimitMaxRequests === null || rateLimitMaxRequests < 1 || rateLimitMaxRequests > 10000) {
    errors.rateLimitMaxRequests = "Enter a whole number from 1 to 10000.";
  }

  if (rateLimitWindowSeconds === null || rateLimitWindowSeconds < 1 || rateLimitWindowSeconds > 86400) {
    errors.rateLimitWindowSeconds = "Enter a whole number from 1 to 86400.";
  }

  if (rateLimitLoginMaxRequests === null || rateLimitLoginMaxRequests < 1 || rateLimitLoginMaxRequests > 1000) {
    errors.rateLimitLoginMaxRequests = "Enter a whole number from 1 to 1000.";
  }

  if (
    rateLimitLoginWindowSeconds === null ||
    rateLimitLoginWindowSeconds < 1 ||
    rateLimitLoginWindowSeconds > 86400
  ) {
    errors.rateLimitLoginWindowSeconds = "Enter a whole number from 1 to 86400.";
  }

  if (!rateLimitMessage) {
    errors.rateLimitMessage = "Default rate limit message is required.";
  } else if (rateLimitMessage.length > 240) {
    errors.rateLimitMessage = "Default rate limit message must be 240 characters or fewer.";
  }

  if (!rateLimitLoginMessage) {
    errors.rateLimitLoginMessage = "Login rate limit message is required.";
  } else if (rateLimitLoginMessage.length > 240) {
    errors.rateLimitLoginMessage = "Login rate limit message must be 240 characters or fewer.";
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
    allowClientSelfSignup: !!values.allowClientSelfSignup,
    allowClientAppointments: !!values.allowClientAppointments,
    allowClientConsultations: !!values.allowClientConsultations,
    supportEmail: String(values.supportEmail ?? "").trim(),
    systemNotice: String(values.systemNotice ?? "").trim(),
    taskReminderIntervalHours:
      parseSecurityNumber(values.taskReminderIntervalHours) ?? DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalHours,
    taskReminderIntervalMinutes:
      parseSecurityNumber(values.taskReminderIntervalMinutes) ??
      DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalMinutes,
    sendClientStatusEmails: !!values.sendClientStatusEmails,
    rateLimitEnabled:
      typeof values.rateLimitEnabled === "boolean"
        ? values.rateLimitEnabled
        : DEFAULT_SYSTEM_CONFIGURATION.rateLimitEnabled,
    rateLimitMaxRequests:
      parseSecurityNumber(values.rateLimitMaxRequests) ?? DEFAULT_SYSTEM_CONFIGURATION.rateLimitMaxRequests,
    rateLimitWindowSeconds:
      parseSecurityNumber(values.rateLimitWindowSeconds) ?? DEFAULT_SYSTEM_CONFIGURATION.rateLimitWindowSeconds,
    rateLimitLoginMaxRequests:
      parseSecurityNumber(values.rateLimitLoginMaxRequests) ??
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginMaxRequests,
    rateLimitLoginWindowSeconds:
      parseSecurityNumber(values.rateLimitLoginWindowSeconds) ??
      DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginWindowSeconds,
    rateLimitMessage:
      String(values.rateLimitMessage ?? "").trim() || DEFAULT_SYSTEM_CONFIGURATION.rateLimitMessage,
    rateLimitLoginMessage:
      String(values.rateLimitLoginMessage ?? "").trim() || DEFAULT_SYSTEM_CONFIGURATION.rateLimitLoginMessage,
    smtpHost: String(values.smtpHost ?? "").trim() || DEFAULT_SYSTEM_CONFIGURATION.smtpHost,
    smtpPort: parseSecurityNumber(values.smtpPort) ?? DEFAULT_SYSTEM_CONFIGURATION.smtpPort,
    smtpUsername: String(values.smtpUsername ?? "").trim(),
    smtpPassword: String(values.smtpPassword ?? ""),
  };
}

function resolveDownloadFilename(headers, fallbackName) {
  const headerValue = String(headers?.["content-disposition"] ?? headers?.["Content-Disposition"] ?? "").trim();
  if (headerValue) {
    const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
    if (utfMatch?.[1]) {
      return decodeURIComponent(utfMatch[1]);
    }

    const basicMatch = headerValue.match(/filename="?([^";]+)"?/i);
    if (basicMatch?.[1]) {
      return basicMatch[1];
    }
  }

  return fallbackName;
}

function downloadBlobResponse(response, fallbackName) {
  const blob = response?.data;
  if (!(blob instanceof Blob)) {
    throw new Error("Download data is not available.");
  }

  const fileName = resolveDownloadFilename(response?.headers, fallbackName);
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
  return fileName;
}

async function readBlobErrorMessage(error, fallbackMessage) {
  const payload = error?.response?.data;
  if (payload instanceof Blob) {
    try {
      const text = await payload.text();
      const parsed = JSON.parse(text);
      if (parsed?.message) {
        return parsed.message;
      }
    } catch (_) { }
  }

  return error?.response?.data?.message || error?.message || fallbackMessage;
}

function toDateTimeLocalInput(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocalInput(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function SystemConfigurationSection({
  systemLoading,
  systemSummaryCards,
  system,
  systemErrors,
  updateSystemText,
  updateSystemToggle,
  updateSystemReminderInterval,
  systemTestRecipient,
  updateSystemTestRecipient,
  user,
  handleSendSystemTestEmail,
  systemSaving,
  systemTestSending,
  handleSaveSystem,
  updateSystemPort,
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">System Configuration</h3>
        <p className="mt-1 text-sm text-slate-500">
          Manage branding, public workflow access, support contact details, and SMTP delivery.
        </p>
      </div>
      <div className="flex-1 space-y-5 p-5">
        {systemLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading system configuration...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {systemSummaryCards.map((card) => (
                <div
                  key={card.key}
                  className={`rounded-lg border px-4 py-3 ${card.className}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                  <p className="mt-2 text-base font-semibold">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">General Preferences</h4>
                <p className="mt-1 text-xs text-slate-500">
                  These values are reused in client emails, login links, public notices, and paused-workflow messages.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Company Name</label>
                  <input
                    type="text"
                    value={system.companyName}
                    onChange={updateSystemText("companyName")}
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.companyName
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
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.appBaseUrl
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

                <div>
                  <label className="block text-sm font-medium text-slate-700">Support Email</label>
                  <input
                    type="email"
                    value={system.supportEmail}
                    onChange={updateSystemText("supportEmail")}
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.supportEmail
                      ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                      }`}
                    placeholder="support@example.com"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Used in paused workflow messages and as the reply-to address for outgoing emails.
                  </p>
                  {systemErrors.supportEmail ? (
                    <p className="mt-1 text-xs text-rose-600">{systemErrors.supportEmail}</p>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Portal Notice</label>
                  <textarea
                    value={system.systemNotice}
                    onChange={updateSystemText("systemNotice")}
                    rows={3}
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.systemNotice
                      ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                      }`}
                    placeholder="Example: Registration approvals may take 1-2 business days this week."
                  />
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Shown on public and client booking pages when you need to announce an update.</span>
                    <span>{String(system.systemNotice || "").trim().length}/500</span>
                  </div>
                  {systemErrors.systemNotice ? (
                    <p className="mt-1 text-xs text-rose-600">{systemErrors.systemNotice}</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Client Workflow Controls</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Pause public sign-up or booking flows without changing routes or touching code.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Allow Client Sign-up</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Controls the public registration form and self-service account creation.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!system.allowClientSelfSignup}
                    onChange={updateSystemToggle("allowClientSelfSignup")}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                  />
                </label>

                <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Allow Appointments</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Lets clients submit service appointment requests from their dashboard.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!system.allowClientAppointments}
                    onChange={updateSystemToggle("allowClientAppointments")}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                  />
                </label>

                <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Allow Consultations</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Controls consultation requests and client-side consultation rescheduling.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!system.allowClientConsultations}
                    onChange={updateSystemToggle("allowClientConsultations")}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Notifications</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Control task reminder timing and the automatic emails sent when client registrations are approved or rejected.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <label className="block text-sm font-medium text-slate-700">Task Reminder Interval</label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Hours
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={1}
                        value={system.taskReminderIntervalHours}
                        onChange={updateSystemReminderInterval("taskReminderIntervalHours")}
                        className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.taskReminderIntervalHours
                          ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                          : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                          }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Minutes
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={1}
                        value={system.taskReminderIntervalMinutes}
                        onChange={updateSystemReminderInterval("taskReminderIntervalMinutes")}
                        className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.taskReminderIntervalMinutes
                          ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                          : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                          }`}
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Controls how often task reminder notifications repeat for due tomorrow, due today, and overdue
                    tasks. For quick testing, set Hours to 0 and Minutes to 2.
                  </p>
                  {systemErrors.taskReminderIntervalHours || systemErrors.taskReminderIntervalMinutes ? (
                    <p className="mt-1 text-xs text-rose-600">
                      {systemErrors.taskReminderIntervalHours || systemErrors.taskReminderIntervalMinutes}
                    </p>
                  ) : null}
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
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.smtpHost
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
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.smtpPort
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
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.smtpUsername
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
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.smtpPassword
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

              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="w-full md:max-w-sm">
                    <label className="block text-sm font-medium text-slate-700">Send test email to</label>
                    <input
                      type="email"
                      value={systemTestRecipient}
                      onChange={updateSystemTestRecipient}
                      className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.recipientEmail
                        ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                        : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                        }`}
                      placeholder={String(user?.email ?? "").trim() || "admin@example.com"}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Uses the current form values, so you can test SMTP before saving.
                    </p>
                    {systemErrors.recipientEmail ? (
                      <p className="mt-1 text-xs text-rose-600">{systemErrors.recipientEmail}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleSendSystemTestEmail}
                    disabled={systemLoading || systemSaving || systemTestSending}
                    className="inline-flex items-center justify-center rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {systemTestSending ? "Sending test..." : "Send Test Email"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4">
        <button
          type="button"
          onClick={handleSaveSystem}
          disabled={systemLoading || systemSaving || systemTestSending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {systemSaving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { user, login } = useAuth();
  const [activeTab, setActiveTab] = React.useState("security");
  const showSecurity = activeTab === "security";
  const showBackup = activeTab === "backup";
  const showSystem = activeTab === "system";
  const showRateLimit = activeTab === "rate-limit";
  const showSystemSettings = showSystem || showRateLimit;
  const showTempMail = activeTab === "temp-mail";
  const showAudit = activeTab === "audit";
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
  const [, setSecurityStatus] = React.useState({ type: "", text: "" });
  const [system, setSystem] = React.useState(DEFAULT_SYSTEM_CONFIGURATION);
  const [savedSystem, setSavedSystem] = React.useState(DEFAULT_SYSTEM_CONFIGURATION);
  const [systemErrors, setSystemErrors] = React.useState({});
  const [systemLoading, setSystemLoading] = React.useState(false);
  const [systemSaving, setSystemSaving] = React.useState(false);
  const [systemTestSending, setSystemTestSending] = React.useState(false);
  const [systemTestRecipient, setSystemTestRecipient] = React.useState(() => String(user?.email ?? "").trim());
  const [, setSystemStatus] = React.useState({ type: "", text: "" });
  const [backupSummary, setBackupSummary] = React.useState({
    database_name: "",
    table_count: 0,
    approx_rows: 0,
    database_size_bytes: 0,
    backup_count: 0,
    backup_storage_bytes: 0,
    last_backup_at: null,
    last_backup_name: "",
  });
  const [backupSchedule, setBackupSchedule] = React.useState(() => ({ ...DEFAULT_BACKUP_SCHEDULE }));
  const [backupScheduleEnabled, setBackupScheduleEnabled] = React.useState(false);
  const [backupScheduleFrequency, setBackupScheduleFrequency] = React.useState(DEFAULT_BACKUP_SCHEDULE.frequency);
  const [backupScheduledForInput, setBackupScheduledForInput] = React.useState("");
  const [backupTables, setBackupTables] = React.useState([]);
  const [backupFiles, setBackupFiles] = React.useState([]);
  const [backupLoading, setBackupLoading] = React.useState(false);
  const [backupCreating, setBackupCreating] = React.useState(false);
  const [backupCleaning, setBackupCleaning] = React.useState(false);
  const [backupExporting, setBackupExporting] = React.useState(false);
  const [backupScheduleSaving, setBackupScheduleSaving] = React.useState(false);
  const [backupDownloading, setBackupDownloading] = React.useState("");
  const [backupDeleting, setBackupDeleting] = React.useState("");
  const [, setBackupStatus] = React.useState({ type: "", text: "" });
  const [backupExportTable, setBackupExportTable] = React.useState("");
  const [backupExportFormat, setBackupExportFormat] = React.useState("csv");
  const [backupCleanupDays, setBackupCleanupDays] = React.useState(30);
  const [backupRefreshKey, setBackupRefreshKey] = React.useState(0);
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [auditError, setAuditError] = useErrorToastState("");
  const [auditSearch, setAuditSearch] = React.useState("");
  const [auditRange, setAuditRange] = React.useState("30d");
  const [auditPage, setAuditPage] = React.useState(1);
  const auditPerPage = AUDIT_LOGS_PER_PAGE;
  const [auditRefreshKey, setAuditRefreshKey] = React.useState(0);
  const [auditMeta, setAuditMeta] = React.useState({
    total: 0,
    page: 1,
    per_page: AUDIT_LOGS_PER_PAGE,
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
    if (!showBackup) {
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const loadBackupDashboard = async () => {
      setBackupLoading(true);
      setBackupStatus((current) => (current.type === "success" ? current : { type: "", text: "" }));

      try {
        const response = await fetchBackupDataOverview({ signal: controller.signal });
        if (!active) return;

        const nextTables = Array.isArray(response?.data?.tables) ? response.data.tables : [];
        const nextBackups = Array.isArray(response?.data?.backups) ? response.data.backups : [];
        const nextSchedule = normalizeBackupSchedule(response?.data?.schedule);
        const scheduledBackupState = response?.data?.scheduled_backup;

        setBackupSummary(
          response?.data?.summary || {
            database_name: "",
            table_count: 0,
            approx_rows: 0,
            database_size_bytes: 0,
            backup_count: 0,
            backup_storage_bytes: 0,
            last_backup_at: null,
            last_backup_name: "",
          }
        );
        setBackupSchedule(nextSchedule);
        setBackupScheduleEnabled(nextSchedule.enabled);
        setBackupScheduleFrequency(nextSchedule.frequency);
        setBackupScheduledForInput(toDateTimeLocalInput(nextSchedule.scheduled_for));
        setBackupTables(nextTables);
        setBackupFiles(nextBackups);
        setBackupExportTable((current) =>
          nextTables.some((table) => table.name === current) ? current : nextTables[0]?.name || ""
        );

        if (scheduledBackupState?.executed) {
          const scheduledMessage =
            scheduledBackupState?.message || "The scheduled backup was created successfully.";
          setBackupStatus((current) => (current.type === "error" ? { type: "", text: "" } : current));
          showSuccessToast({
            title: "Automatic backup completed",
            description: scheduledMessage,
            id: "monitoring-scheduled-backup-success",
            duration: 3500,
          });
        } else if (scheduledBackupState?.failed) {
          const scheduledMessage =
            scheduledBackupState?.message || "The scheduled backup could not be created.";
          setBackupStatus({
            type: "error",
            text: scheduledMessage,
          });
          showErrorToast({
            title: "Automatic backup failed",
            description: scheduledMessage,
            id: "monitoring-scheduled-backup-error",
            duration: 4000,
          });
        }
      } catch (error) {
        if (!active) return;

        setBackupStatus({
          type: "error",
          text: error?.response?.data?.message || "Unable to load backup tools right now.",
        });
      } finally {
        if (active) {
          setBackupLoading(false);
        }
      }
    };

    void loadBackupDashboard();

    return () => {
      active = false;
      controller.abort();
    };
  }, [showBackup, backupRefreshKey]);

  React.useEffect(() => {
    if (!showBackup || typeof window === "undefined") {
      return undefined;
    }

    const handleScheduledBackup = (event) => {
      const detail = event?.detail || {};
      const nextSchedule = normalizeBackupSchedule(detail.schedule);

      setBackupSchedule(nextSchedule);
      setBackupScheduleEnabled(nextSchedule.enabled);
      setBackupScheduleFrequency(nextSchedule.frequency);
      setBackupScheduledForInput(toDateTimeLocalInput(nextSchedule.scheduled_for));

      if (detail.failed) {
        setBackupStatus({
          type: "error",
          text: detail.message || "The scheduled backup could not be created.",
        });
      } else if (detail.executed) {
        setBackupStatus((current) => (current.type === "error" ? { type: "", text: "" } : current));
      }

      setBackupRefreshKey((value) => value + 1);
    };

    window.addEventListener(MONITORING_SCHEDULED_BACKUP_EVENT, handleScheduledBackup);

    return () => {
      window.removeEventListener(MONITORING_SCHEDULED_BACKUP_EVENT, handleScheduledBackup);
    };
  }, [showBackup]);

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
    if (!showSystemSettings) {
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
  }, [showSystemSettings]);

  React.useEffect(() => {
    if (!showSystemSettings) {
      return;
    }

    setSystemTestRecipient((current) => current || String(user?.email ?? "").trim());
  }, [showSystemSettings, user?.email]);

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

  const updateLoginVerificationToggle = (event) => {
    const shouldDisableVerification = !!event.target.checked;

    setSecurity((current) => ({
      ...current,
      loginVerificationEnabled: !shouldDisableVerification,
    }));
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

  const updateSystemTestRecipient = (event) => {
    const nextValue = event.target.value.trimStart();
    setSystemTestRecipient(nextValue);
    setSystemErrors((current) => {
      if (!current.recipientEmail) return current;

      const nextErrors = { ...current };
      delete nextErrors.recipientEmail;
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

  const updateSystemReminderInterval = (key) => (event) => {
    const sanitized = event.target.value.replace(/[^\d]/g, "");

    setSystem((current) => ({
      ...current,
      [key]: sanitized === "" ? "" : Number.parseInt(sanitized, 10),
    }));
    setSystemErrors((current) => {
      if (!current.taskReminderIntervalHours && !current.taskReminderIntervalMinutes) return current;

      const nextErrors = { ...current };
      delete nextErrors.taskReminderIntervalHours;
      delete nextErrors.taskReminderIntervalMinutes;
      return nextErrors;
    });
    setSystemStatus((current) => (current.type ? { type: "", text: "" } : current));
  };

  const updateSystemNumber = (key) => (event) => {
    const sanitized = event.target.value.replace(/[^\d]/g, "");

    setSystem((current) => ({
      ...current,
      [key]: sanitized === "" ? "" : Number.parseInt(sanitized, 10),
    }));
    setSystemErrors((current) => {
      if (!current[key]) return current;

      const nextErrors = { ...current };
      delete nextErrors[key];
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
      showErrorToast({
        title: errors.sessionTimeoutMinutes ? "Invalid session timeout" : "Unable to save settings",
        description: errors.sessionTimeoutMinutes || "Fix the highlighted fields before saving.",
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
      const timeoutLabel = `${savedSettings.sessionTimeoutMinutes} minute${savedSettings.sessionTimeoutMinutes === 1 ? "" : "s"
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

      showSuccessToast({
        title: timeoutChanged ? "Session timeout updated" : "Security settings saved",
        description: timeoutChanged
          ? `Users will now be signed out after ${timeoutLabel} of inactivity.`
          : response?.data?.message || "Security settings saved successfully.",
      });
    } catch (error) {
      setSecurityErrors(error?.response?.data?.errors || {});
      setSecurityStatus({
        type: "error",
        text: error?.response?.data?.message || "Unable to save security settings.",
      });
      showErrorToast({
        title: "Unable to save settings",
        description: error?.response?.data?.message || "Unable to save security settings.",
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
      showErrorToast({
        title: "Unable to save system configuration",
        description: Object.values(errors)[0] || "Fix the highlighted fields before saving.",
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

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(MONITORING_SYSTEM_CONFIG_UPDATED_EVENT, {
            detail: { settings: savedSettings },
          })
        );
      }

      showSuccessToast({
        title: "System configuration saved",
        description: statusEmailsChanged
          ? savedSettings.sendClientStatusEmails
            ? "Client approval and rejection emails are now enabled."
            : "Client approval and rejection emails are now disabled."
          : "",
      });
    } catch (error) {
      setSystemErrors(error?.response?.data?.errors || {});
      setSystemStatus({
        type: "error",
        text: error?.response?.data?.message || "Unable to save system configuration.",
      });
      showErrorToast({
        title: "Unable to save system configuration",
        description: error?.response?.data?.message || "Unable to save system configuration.",
      });
    } finally {
      setSystemSaving(false);
    }
  };

  const handleSendSystemTestEmail = async () => {
    const recipientEmail = String(systemTestRecipient ?? "").trim();
    const errors = validateSystemConfiguration(system);

    if (!recipientEmail || !isValidEmailValue(recipientEmail)) {
      errors.recipientEmail = "Enter a valid recipient email address.";
    }

    if (Object.keys(errors).length > 0) {
      setSystemErrors(errors);
      setSystemStatus({
        type: "error",
        text: "Fix the highlighted fields before sending a test email.",
      });
      showErrorToast({
        title: "Unable to send test email",
        description: Object.values(errors)[0] || "Fix the highlighted fields before sending a test email.",
      });
      return;
    }

    setSystemTestSending(true);
    setSystemStatus({ type: "", text: "" });

    try {
      const payload = buildSystemPayload(system);
      const response = await sendSystemTestEmail({
        settings: payload,
        recipientEmail,
      });
      const normalizedSettings = response?.data?.settings || payload;

      setSystem(normalizedSettings);
      setSystemErrors((current) => {
        if (!current.recipientEmail) {
          return current;
        }

        const nextErrors = { ...current };
        delete nextErrors.recipientEmail;
        return nextErrors;
      });
      setSystemStatus({
        type: "success",
        text: response?.data?.message || `Test email sent to ${recipientEmail}.`,
      });

      showSuccessToast({
        title: "Test email sent",
        description: response?.data?.message || `SMTP settings delivered a message to ${recipientEmail}.`,
      });
    } catch (error) {
      setSystemErrors((current) => ({
        ...current,
        ...(error?.response?.data?.errors || {}),
      }));
      setSystemStatus({
        type: "error",
        text: error?.response?.data?.message || "Unable to send the test email.",
      });
      showErrorToast({
        title: "Unable to send test email",
        description: error?.response?.data?.message || "Unable to send the test email.",
      });
    } finally {
      setSystemTestSending(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupCreating(true);
    setBackupStatus({ type: "", text: "" });

    try {
      const response = await createDatabaseBackup();
      const createdBackup = response?.data?.backup;
      setBackupStatus({
        type: "success",
        text:
          response?.data?.message ||
          (createdBackup?.name ? `${createdBackup.name} is ready in Recent backups.` : "Database backup created."),
      });
      setBackupRefreshKey((value) => value + 1);

      showSuccessToast(
        createdBackup?.name
          ? `${createdBackup.name} was saved successfully.`
          : response?.data?.message || "Database backup created successfully."
      );
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to create database backup.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Backup failed",
        description: message,
      });
    } finally {
      setBackupCreating(false);
    }
  };

  const handleSaveBackupSchedule = async (enabled, scheduledForInputValue, frequencyValue) => {
    const nextEnabled = !!enabled;
    const nextScheduledForInput = String(scheduledForInputValue ?? "").trim();
    const nextFrequency = String(frequencyValue ?? DEFAULT_BACKUP_SCHEDULE.frequency).trim().toLowerCase() || "once";

    if (nextEnabled && !nextScheduledForInput) {
      const message = "Choose a date and time before scheduling an automatic backup.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Schedule not saved",
        description: message,
      });
      return;
    }

    const scheduledFor = nextEnabled ? parseDateTimeLocalInput(nextScheduledForInput) : "";
    if (nextEnabled && !scheduledFor) {
      const message = "Enter a valid future date and time for the automatic backup.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Schedule not saved",
        description: message,
      });
      return;
    }

    if (nextEnabled) {
      const scheduledTimestamp = Date.parse(scheduledFor);
      if (!Number.isFinite(scheduledTimestamp) || scheduledTimestamp <= Date.now()) {
        const message = "Choose a future date and time for the automatic backup.";
        setBackupStatus({ type: "error", text: message });
        showErrorToast({
          title: "Schedule not saved",
          description: message,
        });
        return;
      }
    }

    setBackupScheduleSaving(true);
    setBackupStatus({ type: "", text: "" });

    try {
      const response = await saveBackupSchedule({
        enabled: nextEnabled,
        frequency: nextFrequency,
        scheduled_for: scheduledFor,
      });
      const nextSchedule = normalizeBackupSchedule(response?.data?.schedule);
      setBackupSchedule(nextSchedule);
      setBackupScheduleEnabled(nextSchedule.enabled);
      setBackupScheduleFrequency(nextSchedule.frequency);
      setBackupScheduledForInput(toDateTimeLocalInput(nextSchedule.scheduled_for));

      const frequencyLabel = getBackupScheduleFrequencyLabel(nextSchedule.frequency);
      const message = nextSchedule.enabled
        ? response?.data?.message ||
        `${frequencyLabel} automatic backup scheduled for ${formatDateTime(nextSchedule.scheduled_for)}.`
        : response?.data?.message || "Automatic backup schedule cleared.";
      setBackupStatus({ type: "success", text: message });

      showSuccessToast({
        title: nextSchedule.enabled ? "Automatic backup scheduled" : "Automatic backup cleared",
        description: nextSchedule.enabled
          ? `${frequencyLabel} backup will run next on ${formatDateTime(nextSchedule.scheduled_for)}.`
          : "No automatic backup is scheduled right now.",
      });
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to save the automatic backup schedule.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Schedule not saved",
        description: message,
      });
    } finally {
      setBackupScheduleSaving(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    setBackupDownloading(filename);

    try {
      const response = await downloadDatabaseBackup(filename);
      const downloadedName = downloadBlobResponse(response, filename);
      setBackupStatus({
        type: "success",
        text: `${downloadedName} downloaded successfully.`,
      });
      showSuccessToast(`${downloadedName} downloaded successfully.`);
    } catch (error) {
      const message = await readBlobErrorMessage(error, "Unable to download the selected backup.");
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Download failed",
        description: message,
      });
    } finally {
      setBackupDownloading("");
    }
  };

  const handleExportTable = async () => {
    if (!backupExportTable) {
      setBackupStatus({ type: "error", text: "Choose a table before exporting data." });
      return;
    }

    setBackupExporting(true);
    setBackupStatus({ type: "", text: "" });

    try {
      const response = await exportDatabaseTable(backupExportTable, backupExportFormat);
      const downloadedName = downloadBlobResponse(
        response,
        `${backupExportTable}.${backupExportFormat}`
      );
      setBackupStatus({
        type: "success",
        text: `${downloadedName} downloaded successfully.`,
      });
      showSuccessToast(`${downloadedName} downloaded successfully.`);
    } catch (error) {
      const message = await readBlobErrorMessage(error, "Unable to export the selected table.");
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Export failed",
        description: message,
      });
    } finally {
      setBackupExporting(false);
    }
  };

  const handleCleanupBackups = async () => {
    const confirmation = await showDangerConfirmDialog({
      title: "Delete old backups?",
      text: `Files older than ${backupCleanupDays} days will be removed while keeping the newest 3 backups.`,
      confirmButtonText: "Delete old files",
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    setBackupCleaning(true);
    setBackupStatus({ type: "", text: "" });

    try {
      const response = await cleanupDatabaseBackups({
        days: backupCleanupDays,
        keep_latest: 3,
      });
      const deletedCount = Number(response?.data?.deleted_count || 0);
      const deletedBytes = formatBytes(response?.data?.deleted_bytes || 0);
      setBackupStatus({
        type: "success",
        text:
          deletedCount > 0
            ? `Removed ${deletedCount} old backup file${deletedCount === 1 ? "" : "s"} and freed ${deletedBytes}.`
            : response?.data?.message || `No backups older than ${backupCleanupDays} days were found.`,
      });
      setBackupRefreshKey((value) => value + 1);

      showSuccessToast({
        title: deletedCount > 0 ? "Cleanup completed" : "Nothing to delete",
        description:
          deletedCount > 0
            ? `Deleted ${deletedCount} backup file${deletedCount === 1 ? "" : "s"}.`
            : response?.data?.message || `No backups older than ${backupCleanupDays} days were found.`,
      });
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to clean up old backups.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Cleanup failed",
        description: message,
      });
    } finally {
      setBackupCleaning(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    const confirmation = await showDangerConfirmDialog({
      title: "Delete this backup?",
      text: `${filename} will be removed from backup storage. Type delete to confirm.`,
      input: "text",
      inputPlaceholder: "Type delete",
      inputAttributes: {
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
      },
      inputValidator: (value) =>
        String(value ?? "").trim().toLowerCase() === "delete"
          ? undefined
          : "Type delete to confirm this backup deletion.",
      confirmButtonText: "Delete backup",
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    setBackupDeleting(filename);

    try {
      const response = await deleteDatabaseBackup(filename);
      setBackupStatus({
        type: "success",
        text: response?.data?.message || `${filename} deleted successfully.`,
      });
      setBackupRefreshKey((value) => value + 1);

      showSuccessToast({
        title: "Backup deleted",
        description: response?.data?.message || `${filename} was removed from storage.`,
      });
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to delete the selected backup.";
      setBackupStatus({ type: "error", text: message });
      showErrorToast({
        title: "Delete failed",
        description: message,
      });
    } finally {
      setBackupDeleting("");
    }
  };

  const systemSummaryCards = [
    {
      key: "signup",
      label: "Client sign-up",
      value: system.allowClientSelfSignup ? "Open" : "Paused",
      className: system.allowClientSelfSignup
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      key: "appointments",
      label: "Appointments",
      value: system.allowClientAppointments ? "Open" : "Paused",
      className: system.allowClientAppointments
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      key: "consultations",
      label: "Consultations",
      value: system.allowClientConsultations ? "Open" : "Paused",
      className: system.allowClientConsultations
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      key: "email",
      label: "SMTP status",
      value: system.smtpUsername && system.smtpPassword ? "Ready" : "Needs setup",
      className: system.smtpUsername && system.smtpPassword
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : "border-slate-200 bg-slate-100 text-slate-700",
    },
  ];

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
      onClick: () => setActiveTab("security"),
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
      onClick: () => setActiveTab("backup"),
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
      onClick: () => setActiveTab("system"),
    },
    {
      key: "rate-limit",
      title: "Rate Limiting",
      desc: "API request limits and wait messages for regular and login requests.",
      iconBg: "bg-teal-50 text-teal-600",
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v3m0 12v3m9-9h-3M6 12H3m14.95-5.95-2.12 2.12M8.17 15.83l-2.12 2.12m0-11.9 2.12 2.12m7.66 7.66 2.12 2.12"
          />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ),
      action: "Configure",
      onClick: () => setActiveTab("rate-limit"),
    },
    {
      key: "temp-mail",
      title: "Temp Mail Blocker",
      desc: "Block disposable email domains and exact email addresses.",
      iconBg: "bg-rose-50 text-rose-600",
      icon: <Ban className="h-5 w-5" aria-hidden />,
      action: "Manage",
      onClick: () => setActiveTab("temp-mail"),
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
      onClick: () => setActiveTab("audit"),
    },
  ];

  const sectionProps = {
    securityLoading,
    security,
    securityErrors,
    updateSecurity,
    updateLoginVerificationToggle,
    handleSaveSecurity,
    securitySaving,
    backupLoading,
    backupSummary,
    backupCreating,
    handleCreateBackup,
    backupScheduleEnabled,
    setBackupScheduleEnabled,
    backupScheduleSaving,
    backupScheduleFrequency,
    setBackupScheduleFrequency,
    backupScheduledForInput,
    toDateTimeLocalInput,
    setBackupScheduledForInput,
    handleSaveBackupSchedule,
    backupSchedule,
    backupExportTable,
    setBackupExportTable,
    backupTables,
    backupExporting,
    backupExportFormat,
    setBackupExportFormat,
    handleExportTable,
    backupCleanupDays,
    setBackupCleanupDays,
    backupCleaning,
    backupFiles,
    handleCleanupBackups,
    setBackupRefreshKey,
    backupDownloading,
    handleDownloadBackup,
    backupDeleting,
    handleDeleteBackup,
    systemLoading,
    systemSummaryCards,
    system,
    systemErrors,
    updateSystemText,
    updateSystemToggle,
    updateSystemReminderInterval,
    systemTestRecipient,
    updateSystemTestRecipient,
    user,
    handleSendSystemTestEmail,
    systemSaving,
    systemTestSending,
    handleSaveSystem,
    updateSystemPort,
    updateSystemNumber,
    auditLoading,
    auditMeta,
    auditSearch,
    setAuditSearch,
    setAuditPage,
    auditRange,
    setAuditRange,
    auditPerPage,
    setAuditRefreshKey,
    auditLogs,
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Administration and configuration</p>
      </div>

      <div className="mb-6 overflow-x-auto">
        <div className="inline-flex min-w-full sm:min-w-0 sm:flex-none rounded-lg bg-slate-100 p-1">
          <nav className="flex flex-1 gap-1" aria-label="Tabs">
            {cards.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                className={`flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${activeTab === card.key
                  ? "bg-white text-slate-800 shadow-sm ring-1 ring-black/5"
                  : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                  }`}
              >
                <div
                  className={`flex h-4 w-4 items-center justify-center ${activeTab === card.key ? "text-indigo-600" : "text-slate-400"
                    }`}
                  aria-hidden
                >
                  {card.icon}
                </div>
                <span className="whitespace-nowrap">{card.title}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="min-w-0">
        {showSecurity ? <SecuritySettingsSection {...sectionProps} /> : null}

        {showBackup ? <BackupSection {...sectionProps} /> : null}

        {showSystem ? <SystemConfigurationSection {...sectionProps} /> : null}

        {showRateLimit ? <RateLimitingSection {...sectionProps} /> : null}

        {showTempMail ? <TempMailBlockerSection /> : null}

        {showAudit ? <AuditLogsSection {...sectionProps} /> : null}
      </div>
    </div>
  );
}


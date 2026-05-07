import React from "react";
import { formatDateTime } from "../utils/helpers";
const BACKUP_RETENTION_OPTIONS = [7, 30, 90, 180];
const BACKUP_EXPORT_FORMAT_OPTIONS = [
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
];
const BACKUP_SCHEDULE_FREQUENCY_OPTIONS = [
  { value: "once", label: "One time" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export function getBackupScheduleFrequencyLabel(value) {
  return (
    BACKUP_SCHEDULE_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ||
    BACKUP_SCHEDULE_FREQUENCY_OPTIONS[0].label
  );
}

function getBackupScheduleFrequencyHelper(value) {
  switch (value) {
    case "daily":
      return "The selected time will repeat every day starting from the date you choose.";
    case "weekly":
      return "The selected day and time will repeat every week.";
    case "monthly":
      return "The selected day of the month and time will repeat every month. Shorter months use their last available day.";
    default:
      return "The selected backup will run once at the exact date and time you choose.";
  }
}

export function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const normalized = bytes / 1024 ** exponent;
  const digits = normalized >= 100 || exponent === 0 ? 0 : normalized >= 10 ? 1 : 2;
  return `${normalized.toFixed(digits)} ${units[exponent]}`;
}

export default function BackupSection({
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
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Backup & Data</h3>
        <p className="mt-1 text-sm text-slate-500">
          Create full SQL backups, export live tables, and manage stored backup files.
        </p>
      </div>
      <div className="space-y-5 p-5">
        {backupLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading backup and export tools...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Database</div>
                <div className="mt-2 text-lg font-semibold text-slate-800">
                  {backupSummary.database_name || "Unknown"}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Size: {formatBytes(backupSummary.database_size_bytes)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Tables</div>
                <div className="mt-2 text-lg font-semibold text-slate-800">{backupSummary.table_count || 0}</div>
                <p className="mt-1 text-xs text-slate-500">Available for per-table export.</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Approx. Rows</div>
                <div className="mt-2 text-lg font-semibold text-slate-800">
                  {Number(backupSummary.approx_rows || 0).toLocaleString()}
                </div>
                <p className="mt-1 text-xs text-slate-500">Based on MySQL table statistics.</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Backup Storage</div>
                <div className="mt-2 text-lg font-semibold text-slate-800">
                  {formatBytes(backupSummary.backup_storage_bytes)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {backupSummary.backup_count || 0} stored backup
                  {Number(backupSummary.backup_count || 0) === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Create Full SQL Backup</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Generates a restorable `.sql` snapshot of the current database and stores it in backup
                        history.
                      </p>
                      <p className="mt-3 text-xs text-slate-500">
                        Last backup:{" "}
                        {backupSummary.last_backup_at
                          ? `${formatDateTime(backupSummary.last_backup_at)}${backupSummary.last_backup_name ? ` (${backupSummary.last_backup_name})` : ""}`
                          : "No backups created yet."}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateBackup}
                      disabled={backupCreating}
                      className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {backupCreating ? "Creating..." : "Create Backup"}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-800">Schedule Automatic Backup</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Choose when automatic SQL backups should run. The app checks for due schedules about once
                      a minute while users are active.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <input
                      type="checkbox"
                      checked={backupScheduleEnabled}
                      onChange={(event) => {
                        setBackupScheduleEnabled(event.target.checked);
                      }}
                      disabled={backupScheduleSaving}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800">Enable automatic backup</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        When enabled, the next backup will be created automatically at the chosen time.
                      </p>
                    </div>
                  </label>

                  <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
                    <div className="w-full sm:w-48">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Repeat
                      </label>
                      <select
                        value={backupScheduleFrequency}
                        onChange={(event) => setBackupScheduleFrequency(event.target.value)}
                        disabled={backupScheduleSaving}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {BACKUP_SCHEDULE_FREQUENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full sm:flex-1 sm:min-w-[240px]">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Backup date and time
                      </label>
                      <input
                        type="datetime-local"
                        value={backupScheduledForInput}
                        min={toDateTimeLocalInput(new Date(Date.now() + 60 * 1000))}
                        onChange={(event) => setBackupScheduledForInput(event.target.value)}
                        disabled={backupScheduleSaving}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    </div>

                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() =>
                          void handleSaveBackupSchedule(
                            backupScheduleEnabled,
                            backupScheduledForInput,
                            backupScheduleFrequency
                          )
                        }
                        disabled={backupScheduleSaving}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {backupScheduleSaving ? "Saving..." : "Save Schedule"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSaveBackupSchedule(false, "", backupScheduleFrequency)}
                        disabled={backupScheduleSaving}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {getBackupScheduleFrequencyHelper(backupScheduleFrequency)}
                  </p>

                  <div className="mt-4 space-y-2 text-xs text-slate-500">
                    <p>
                      Repeat:{" "}
                      <span className="font-medium text-slate-700">
                        {backupSchedule.enabled
                          ? getBackupScheduleFrequencyLabel(backupSchedule.frequency)
                          : "Not scheduled"}
                      </span>
                    </p>
                    <p>
                      Next automatic backup:{" "}
                      <span className="font-medium text-slate-700">
                        {backupSchedule.enabled && backupSchedule.scheduled_for
                          ? formatDateTime(backupSchedule.scheduled_for)
                          : "Not scheduled"}
                      </span>
                    </p>
                    <p>
                      Last automatic attempt:{" "}
                      <span className="font-medium text-slate-700">
                        {backupSchedule.last_attempt_at
                          ? formatDateTime(backupSchedule.last_attempt_at)
                          : "No automatic backup has run yet."}
                      </span>
                    </p>
                  </div>

                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-800">Export Live Table Data</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Export a single database table in CSV, JSON, or import-ready SQL format.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Table
                      </label>
                      <select
                        value={backupExportTable}
                        onChange={(event) => setBackupExportTable(event.target.value)}
                        disabled={backupTables.length === 0 || backupExporting}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {backupTables.length === 0 ? <option value="">No tables available</option> : null}
                        {backupTables.map((table) => (
                          <option key={table.name} value={table.name}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Format
                      </label>
                      <select
                        value={backupExportFormat}
                        onChange={(event) => setBackupExportFormat(event.target.value)}
                        disabled={backupExporting}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {BACKUP_EXPORT_FORMAT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportTable}
                      disabled={!backupExportTable || backupExporting}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {backupExporting ? "Exporting..." : "Export Table"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-800">Backup Lifecycle</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Remove older backup files to keep storage tidy. The newest 3 backups are always kept.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                        Delete backups older than
                      </label>
                      <select
                        value={backupCleanupDays}
                        onChange={(event) => setBackupCleanupDays(Number(event.target.value))}
                        disabled={backupCleaning}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {BACKUP_RETENTION_OPTIONS.map((days) => (
                          <option key={days} value={days}>
                            {days} days
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleCleanupBackups}
                      disabled={backupCleaning || backupFiles.length === 0}
                      className="inline-flex items-center justify-center rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {backupCleaning ? "Cleaning..." : "Clean Up"}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Recent Backups</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Download or remove stored SQL snapshots. The newest files stay at the top and the list
                        scrolls when there are many backups.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBackupRefreshKey((value) => value + 1)}
                      disabled={backupLoading}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Refresh
                    </button>
                  </div>

                  {backupFiles.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                      No backup files stored yet.
                    </div>
                  ) : (
                    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {backupFiles.map((backup) => (
                        <div
                          key={backup.name}
                          className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-800">{backup.name}</div>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTime(backup.created_at)} {" • "} {formatBytes(backup.size_bytes)}
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDownloadBackup(backup.name)}
                                disabled={backupDownloading === backup.name}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {backupDownloading === backup.name ? "Downloading..." : "Download"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteBackup(backup.name)}
                                disabled={backupDeleting === backup.name}
                                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {backupDeleting === backup.name ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-800">Table Catalog</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Quick visibility into the tables currently available in the database and their estimated size.
                </p>
              </div>

              {backupTables.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No tables were detected in the selected database.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="max-h-[30vh] overflow-auto">
                    <table className="min-w-full table-fixed text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Table</th>
                          <th className="w-32 px-3 py-2 text-left font-medium">Engine</th>
                          <th className="w-36 px-3 py-2 text-right font-medium">Approx. Rows</th>
                          <th className="w-36 px-3 py-2 text-right font-medium">Size</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {backupTables.map((table) => (
                          <tr key={table.name}>
                            <td className="px-3 py-2 text-slate-800">{table.name}</td>
                            <td className="px-3 py-2 text-slate-600">{table.engine || "-"}</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {Number(table.rows || 0).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {formatBytes(table.size_bytes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

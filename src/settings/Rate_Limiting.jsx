import React from "react";
const RATE_LIMIT_FIELDS = [
  {
    key: "rateLimitMaxRequests",
    label: "Default Request Limit",
    helper: "Applies to all regular API requests combined for each signed-in user.",
    min: 1,
    max: 10000,
  },
  {
    key: "rateLimitWindowSeconds",
    label: "Default Window",
    helper: "Seconds before each signed-in user's combined regular request counter resets.",
    min: 1,
    max: 86400,
  },
  {
    key: "rateLimitLoginMaxRequests",
    label: "Login Attempt Limit",
    helper: "Applies to login attempts separately.",
    min: 1,
    max: 1000,
  },
  {
    key: "rateLimitLoginWindowSeconds",
    label: "Login Window",
    helper: "Seconds before the login counter resets.",
    min: 1,
    max: 86400,
  },
];

export default function RateLimitingSection({
  systemLoading,
  system,
  systemErrors,
  updateSystemToggle,
  updateSystemNumber,
  updateSystemText,
  handleSaveSystem,
  systemSaving,
  systemTestSending,
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Rate Limiting</h3>
        <p className="mt-1 text-sm text-slate-500">
          Control how many regular API requests each signed-in user can send across the app before the system asks them to wait.
        </p>
      </div>

      <div className="flex-1 space-y-5 p-5">
        {systemLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading rate limiting settings...
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-4">
              <div>
                <div className="text-sm font-medium text-slate-800">Enable API Rate Limiting</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Uses the saved limits below for combined per-user regular requests and per-device login attempts.
                </p>
              </div>
              <input
                type="checkbox"
                checked={!!system.rateLimitEnabled}
                onChange={updateSystemToggle("rateLimitEnabled")}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {RATE_LIMIT_FIELDS.map((field) => (
                <div key={field.key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <label className="block text-sm font-medium text-slate-700">{field.label}</label>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={1}
                    value={system[field.key]}
                    onChange={updateSystemNumber(field.key)}
                    className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors[field.key]
                      ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                      }`}
                  />
                  <p className="mt-1 text-xs text-slate-500">{field.helper}</p>
                  {systemErrors[field.key] ? (
                    <p className="mt-1 text-xs text-rose-600">{systemErrors[field.key]}</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Default Limit Message</label>
                <textarea
                  value={system.rateLimitMessage}
                  onChange={updateSystemText("rateLimitMessage")}
                  rows={2}
                  className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.rateLimitMessage
                    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                    }`}
                />
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Shown after a signed-in user exceeds the saved combined regular request limit.</span>
                  <span>{String(system.rateLimitMessage || "").trim().length}/240</span>
                </div>
                {systemErrors.rateLimitMessage ? (
                  <p className="mt-1 text-xs text-rose-600">{systemErrors.rateLimitMessage}</p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Login Limit Message</label>
                <textarea
                  value={system.rateLimitLoginMessage}
                  onChange={updateSystemText("rateLimitLoginMessage")}
                  rows={2}
                  className={`mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${systemErrors.rateLimitLoginMessage
                    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/15"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-500/15"
                    }`}
                />
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Shown after login attempts exceed the saved limit.</span>
                  <span>{String(system.rateLimitLoginMessage || "").trim().length}/240</span>
                </div>
                {systemErrors.rateLimitLoginMessage ? (
                  <p className="mt-1 text-xs text-rose-600">{systemErrors.rateLimitLoginMessage}</p>
                ) : null}
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

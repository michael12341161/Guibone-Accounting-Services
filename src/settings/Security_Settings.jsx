import React from "react";
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

export default function SecuritySettingsSection({
  StatusBanner,
  securityStatus,
  securityLoading,
  security,
  securityErrors,
  updateSecurity,
  updateLoginVerificationToggle,
  handleSaveSecurity,
  securitySaving,
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Security Settings</h3>
        <p className="mt-1 text-sm text-slate-500">
          Save the password, expiry, timeout, lockout, and login verification rules used by the system.
        </p>
      </div>

      <div className="space-y-5 p-5">
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
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-4 ${securityErrors[field.key]
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

            <label className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-800">Disable Login Verification</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Turns off the math verification challenge on the public login page. Leave unchecked to keep
                  verification required.
                </p>
              </div>
              <input
                type="checkbox"
                checked={!security.loginVerificationEnabled}
                onChange={updateLoginVerificationToggle}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4">
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
  );
}

import React, { useMemo, useState } from "react";
import { apiSession } from "../services/api";
import { MIN_PASSWORD_LENGTH } from "../utils/passwordValidation";

export default function ForgotPasswordModal({ open, onClose }) {
  const [step, setStep] = useState("email"); // email | code | reset
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canClose = !loading;

  const close = () => {
    if (!canClose) return;
    setStep("email");
    setEmail("");
    setCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    setError("");
    onClose?.();
  };

  const title = useMemo(() => {
    if (step === "email") return "Forgot password";
    if (step === "code") return "Verify code";
    return "Reset password";
  }, [step]);

  const sendCode = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Please enter your registered email.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiSession.post("password_reset_send_code.php", { email: email.trim() });
      if (res.data?.success) {
        setMessage(res.data?.message || "Verification code sent.");
        setStep("code");
      } else {
        setError(res.data?.message || "Failed to send code.");
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError("");
    setMessage("");
    if (!/^[0-9]{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiSession.post("password_reset_verify_code.php", {
        email: email.trim(),
        code: code.trim(),
      });
      if (res.data?.success && res.data?.reset_token) {
        setResetToken(res.data.reset_token);
        setStep("reset");
        setMessage("Code verified. You can now reset your password.");
      } else {
        setError(res.data?.message || "Invalid or expired code.");
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError("");
    setMessage("");
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiSession.post("password_reset_update.php", {
        email: email.trim(),
        reset_token: resetToken,
        new_password: newPassword,
      });
      if (res.data?.success) {
        setMessage(res.data?.message || "Password updated successfully.");
        // Close after short delay
        setTimeout(() => close(), 800);
      } else {
        setError(res.data?.message || "Failed to update password.");
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {step === "email" && "We’ll send a verification code to your email."}
                {step === "code" && "Enter the code we sent to your email."}
                {step === "reset" && "Create a new password for your account."}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={!canClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-60"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-4">
            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {message}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {step === "email" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:opacity-70"
                >
                  {loading ? "Sending…" : "Send Code"}
                </button>
              </div>
            )}

            {step === "code" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Verification Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-70"
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    onClick={verifyCode}
                    disabled={loading}
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-70"
                  >
                    Verify
                  </button>
                </div>
              </div>
            )}

            {step === "reset" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
                  />
                </div>

                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:opacity-70"
                >
                  {loading ? "Updating…" : "Reset Password"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

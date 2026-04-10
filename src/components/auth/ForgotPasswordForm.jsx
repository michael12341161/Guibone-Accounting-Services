import React, { useState } from "react";
import { Button } from "../UI/buttons";
import InputField from "../UI/InputField";
import PasswordRequirementsPanel from "./PasswordRequirementsPanel";

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function formatMinutesLabel(minutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatDaysLabel(days) {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function ForgotPasswordForm({
  step,
  email,
  code,
  newPassword,
  confirmPassword,
  maxPasswordLength,
  passwordExpiryDays,
  codeExpiryMinutes,
  resetWindowMinutes,
  loading,
  message,
  error,
  onEmailChange,
  onCodeChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSendCode,
  onVerifyCode,
  onResetPassword,
}) {
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const shouldShowPasswordRequirements = newPassword.length > 0;
  const passwordCardActive =
    passwordFocused || confirmFocused || Boolean(newPassword) || Boolean(confirmPassword);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (step === "email") {
      onSendCode();
      return;
    }

    if (step === "code") {
      onVerifyCode();
      return;
    }

    onResetPassword();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {step === "email" ? (
        <>
          <InputField
            id="forgot-password-email"
            type="email"
            label="Email"
            value={email}
            onChange={onEmailChange}
            placeholder="you@example.com"
            required
          />

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? (
              <>
                <SpinnerIcon />
                <span>Sending...</span>
              </>
            ) : (
              "Send Code"
            )}
          </Button>
        </>
      ) : null}

      {step === "code" ? (
        <>
          <InputField
            id="forgot-password-code"
            label="Verification Code"
            value={code}
            onChange={onCodeChange}
            placeholder="6-digit code"
            inputMode="numeric"
            maxLength={6}
            required
          />

          {codeExpiryMinutes > 0 ? (
            <p className="text-xs text-slate-500">
              This verification code expires in {formatMinutesLabel(codeExpiryMinutes)}.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={onSendCode} disabled={loading}>
              Resend
            </Button>

            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <SpinnerIcon />
                  <span>Verifying...</span>
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        </>
      ) : null}

      {step === "reset" ? (
        <>
          <div className="space-y-1 text-xs text-slate-500">
            {resetWindowMinutes > 0 ? (
              <p>
                Complete the password change within {formatMinutesLabel(resetWindowMinutes)} after verification.
              </p>
            ) : null}
            {passwordExpiryDays > 0 ? (
              <p>Your new password will expire again in {formatDaysLabel(passwordExpiryDays)}.</p>
            ) : (
              <p>Password expiry is currently disabled.</p>
            )}
          </div>

          <InputField
            id="forgot-password-new"
            type="password"
            label="New Password"
            value={newPassword}
            onChange={onNewPasswordChange}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="Enter new password"
            maxLength={maxPasswordLength}
            required
          />

          <InputField
            id="forgot-password-confirm"
            type="password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={onConfirmPasswordChange}
            onFocus={() => setConfirmFocused(true)}
            onBlur={() => setConfirmFocused(false)}
            placeholder="Re-enter new password"
            maxLength={maxPasswordLength}
            required
          />

          {shouldShowPasswordRequirements ? (
            <PasswordRequirementsPanel
              password={newPassword}
              confirmPassword={confirmPassword}
              maxPasswordLength={maxPasswordLength}
              showConfirmation
              active={passwordCardActive}
            />
          ) : null}

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? (
              <>
                <SpinnerIcon />
                <span>Updating...</span>
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </>
      ) : null}
    </form>
  );
}

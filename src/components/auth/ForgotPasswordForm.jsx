import React, { useState } from "react";
import { Button } from "../UI/buttons";
import InputField from "../UI/InputField";
import PasswordRequirementsPanel from "./PasswordRequirementsPanel";

function SpinnerIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
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

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5a10.45 10.45 0 0 0 4.703-1.098M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88"
      />
    </svg>
  );
}

function formatMinutesLabel(minutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatDaysLabel(days) {
  return `${days} day${days === 1 ? "" : "s"}`;
}

function ForgotPasswordProgress({ steps = [], activeStepIndex = 0, progressPercent = 25 }) {
  const safeSteps = Array.isArray(steps) && steps.length ? steps : [];
  const boundedIndex = Math.max(0, Math.min(activeStepIndex, safeSteps.length - 1));
  const boundedProgress = Math.max(0, Math.min(100, Number(progressPercent) || 0));

  if (!safeSteps.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2.5">
      <div className="flex items-center" aria-label="Password reset progress">
        {safeSteps.map((item, index) => {
          const complete = index < boundedIndex;
          const active = index === boundedIndex;
          const circleClassName = complete
            ? "border-emerald-600 bg-emerald-600 text-white"
            : active
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-500";
          const lineClassName = index < boundedIndex ? "bg-emerald-500" : "bg-slate-200";

          return (
            <React.Fragment key={item.id || item.label}>
              <div className="flex min-w-0 flex-col items-center gap-0.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-semibold transition ${circleClassName}`}
                  aria-current={active ? "step" : undefined}
                >
                  {index + 1}
                </span>
                <span className={active ? "text-[9px] font-semibold text-emerald-700" : "text-[9px] font-medium text-slate-500"}>
                  {item.label}
                </span>
              </div>
              {index < safeSteps.length - 1 ? <div className={`mx-1.5 h-0.5 flex-1 rounded-full ${lineClassName}`} /> : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 text-[10px] font-semibold text-slate-600">
        <span>
          Step {boundedIndex + 1} of {safeSteps.length}
        </span>
        <span className="text-emerald-700">{boundedProgress}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300"
          style={{ width: `${boundedProgress}%` }}
        />
      </div>
    </div>
  );
}

export default function ForgotPasswordForm({
  step,
  steps,
  activeStepIndex,
  progressPercent,
  email,
  code,
  newPassword,
  confirmPassword,
  maxPasswordLength,
  passwordExpiryDays,
  codeExpiryMinutes,
  resetWindowMinutes,
  loading,
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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const shouldShowPasswordRequirements = newPassword.length > 0;
  const passwordCardActive =
    passwordFocused || confirmFocused || Boolean(newPassword) || Boolean(confirmPassword);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (step === "done") {
      return;
    }

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
    <form className="space-y-3" onSubmit={handleSubmit}>
      <ForgotPasswordProgress
        steps={steps}
        activeStepIndex={activeStepIndex}
        progressPercent={progressPercent}
      />

      {step === "email" ? (
        <>
          <InputField
            id="forgot-password-email"
            type="email"
            label="Email"
            value={email}
            onChange={onEmailChange}
            placeholder="you@example.com"
            autoComplete="username"
            compact
            required
          />

          <Button type="submit" size="sm" fullWidth disabled={loading}>
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
            compact
            required
          />

          {codeExpiryMinutes > 0 ? (
            <p className="text-[11px] text-slate-500">
              This verification code expires in {formatMinutesLabel(codeExpiryMinutes)}.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onSendCode} disabled={loading}>
              Resend
            </Button>

            <Button type="submit" size="sm" disabled={loading}>
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
          <div className="space-y-1 text-[11px] text-slate-500">
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
            type={showNewPassword ? "text" : "password"}
            label="New Password"
            value={newPassword}
            onChange={onNewPasswordChange}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="Enter new password"
            maxLength={maxPasswordLength}
            compact
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowNewPassword((value) => !value)}
                className="rounded-md px-1.5 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            }
            autoComplete="new-password"
            required
          />

          <InputField
            id="forgot-password-confirm"
            type={showConfirmPassword ? "text" : "password"}
            label="Confirm Password"
            value={confirmPassword}
            onChange={onConfirmPasswordChange}
            onFocus={() => setConfirmFocused(true)}
            onBlur={() => setConfirmFocused(false)}
            placeholder="Re-enter new password"
            maxLength={maxPasswordLength}
            compact
            rightAdornment={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="rounded-md px-1.5 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            }
            autoComplete="new-password"
            required
          />

          {shouldShowPasswordRequirements ? (
            <PasswordRequirementsPanel
              password={newPassword}
              confirmPassword={confirmPassword}
              maxPasswordLength={maxPasswordLength}
              showConfirmation
              active={passwordCardActive}
              compact
            />
          ) : null}

          <Button type="submit" size="sm" fullWidth disabled={loading}>
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

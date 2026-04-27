import React, { useEffect, useMemo, useState } from "react";
import ForgotPasswordForm from "../../components/auth/ForgotPasswordForm";
import { Modal } from "../../components/UI/modal";
import {
  api,
  apiSession,
  DEFAULT_SECURITY_SETTINGS,
  fetchSecuritySettings,
  normalizeSecuritySettings,
} from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import { useErrorToast } from "../../utils/feedback";
import {
  validatePasswordValue,
} from "../../utils/passwordValidation";

const DEFAULT_CODE_EXPIRY_MINUTES = 5;
const DEFAULT_RESET_WINDOW_MINUTES = 15;

function normalizePositiveMinutes(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeDays(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function resolvePasswordExpiryDays(overrideValue, securitySettings) {
  if (overrideValue !== null && overrideValue !== undefined && overrideValue !== "") {
    return normalizeNonNegativeDays(overrideValue, 0);
  }

  return normalizeNonNegativeDays(securitySettings?.passwordExpiryDays);
}

function formatMinutesLabel(minutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatDaysLabel(days) {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function ForgotPasswordModal({
  open,
  onClose,
  defaultEmail = "",
  passwordExpiryDaysOverride = null,
  securitySettingsOverride = null,
}) {
  const { login } = useAuth();
  const [step, setStep] = useState("email"); // email | code | reset
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securitySettings, setSecuritySettings] = useState(() =>
    securitySettingsOverride && typeof securitySettingsOverride === "object"
      ? normalizeSecuritySettings(securitySettingsOverride)
      : DEFAULT_SECURITY_SETTINGS
  );
  const [codeExpiryMinutes, setCodeExpiryMinutes] = useState(DEFAULT_CODE_EXPIRY_MINUTES);
  const [resetWindowMinutes, setResetWindowMinutes] = useState(DEFAULT_RESET_WINDOW_MINUTES);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useErrorToast(error);

  const canClose = !loading;

  useEffect(() => {
    if (!open) return;
    setEmail(String(defaultEmail || "").trim());
  }, [defaultEmail, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    if (securitySettingsOverride && typeof securitySettingsOverride === "object") {
      setSecuritySettings(normalizeSecuritySettings(securitySettingsOverride));
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    const loadSecuritySettings = async () => {
      try {
        const response = await fetchSecuritySettings({ signal: controller.signal });
        if (!active) return;
        setSecuritySettings(response?.data?.settings || DEFAULT_SECURITY_SETTINGS);
      } catch (_) {
        if (!active) return;
        setSecuritySettings(DEFAULT_SECURITY_SETTINGS);
      }
    };

    loadSecuritySettings();

    return () => {
      active = false;
      controller.abort();
    };
  }, [open, securitySettingsOverride]);

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
    setCodeExpiryMinutes(DEFAULT_CODE_EXPIRY_MINUTES);
    setResetWindowMinutes(DEFAULT_RESET_WINDOW_MINUTES);
    onClose?.();
  };

  const title = useMemo(() => {
    if (step === "email") return "Forgot password";
    if (step === "code") return "Verify code";
    return "Reset password";
  }, [step]);

  const description = useMemo(() => {
    const passwordExpiryDays = resolvePasswordExpiryDays(
      passwordExpiryDaysOverride,
      securitySettings
    );
    const passwordLifetimeText =
      passwordExpiryDays > 0
        ? ` Your new password will expire again in ${formatDaysLabel(passwordExpiryDays)}.`
        : " Password expiry is currently disabled.";

    if (step === "email") {
      return `We'll send a verification code to your email. The code stays valid for ${formatMinutesLabel(codeExpiryMinutes)}.${passwordLifetimeText}`;
    }
    if (step === "code") {
      return `Enter the code we sent to your email. It expires in ${formatMinutesLabel(codeExpiryMinutes)}.${passwordLifetimeText}`;
    }
    return `Create a new password for your account. Complete the change within ${formatMinutesLabel(resetWindowMinutes)}.${passwordLifetimeText}`;
  }, [codeExpiryMinutes, passwordExpiryDaysOverride, resetWindowMinutes, securitySettings, step]);

  const sendCode = async () => {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Please enter your registered email.");
      return;
    }

    setLoading(true);

    try {
      const res = await apiSession.post("password_reset_send_code.php", {
        email: email.trim(),
      });

      if (res.data?.success) {
        const nextCodeExpiryMinutes = normalizePositiveMinutes(
          res.data?.code_expires_in_minutes,
          DEFAULT_CODE_EXPIRY_MINUTES
        );
        setCodeExpiryMinutes(nextCodeExpiryMinutes);
        setMessage(
          `${res.data?.message || "Verification code sent."} The code expires in ${formatMinutesLabel(nextCodeExpiryMinutes)}.`
        );
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
        const nextResetWindowMinutes = normalizePositiveMinutes(
          res.data?.reset_token_expires_in_minutes,
          DEFAULT_RESET_WINDOW_MINUTES
        );
        const passwordExpiryDays = resolvePasswordExpiryDays(
          passwordExpiryDaysOverride,
          securitySettings
        );
        setResetToken(res.data.reset_token);
        setResetWindowMinutes(nextResetWindowMinutes);
        setStep("reset");
        setMessage(
          passwordExpiryDays > 0
            ? `Code verified. You have ${formatMinutesLabel(nextResetWindowMinutes)} to reset your password. Your new password will expire again in ${formatDaysLabel(passwordExpiryDays)}.`
            : `Code verified. You have ${formatMinutesLabel(nextResetWindowMinutes)} to reset your password. Password expiry is currently disabled.`
        );
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

    const passwordValidationError = validatePasswordValue(newPassword, {
      maxPasswordLength: securitySettings.maxPasswordLength,
    });
    if (passwordValidationError) {
      setError(passwordValidationError);
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
        const passwordExpiryDays = resolvePasswordExpiryDays(
          passwordExpiryDaysOverride,
          securitySettings
        );
        try {
          const sessionResponse = await api.get("session_status.php");
          const nextUser = sessionResponse?.data?.authenticated ? sessionResponse.data.user : null;
          if (nextUser) {
            login(nextUser);
          }
        } catch (_) {}
        setMessage(
          passwordExpiryDays > 0
            ? `${res.data?.message || "Password updated successfully."} Your new password will expire again in ${formatDaysLabel(passwordExpiryDays)}.`
            : `${res.data?.message || "Password updated successfully."} Password expiry is currently disabled.`
        );
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

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      closeOnOverlayClick={canClose}
    >
      <ForgotPasswordForm
        step={step}
        email={email}
        code={code}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        maxPasswordLength={securitySettings.maxPasswordLength}
        passwordExpiryDays={resolvePasswordExpiryDays(passwordExpiryDaysOverride, securitySettings)}
        codeExpiryMinutes={codeExpiryMinutes}
        resetWindowMinutes={resetWindowMinutes}
        loading={loading}
        message={message}
        error={error}
        onEmailChange={(event) => setEmail(event.target.value)}
        onCodeChange={(event) =>
          setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        onNewPasswordChange={(event) => setNewPassword(event.target.value)}
        onConfirmPasswordChange={(event) => setConfirmPassword(event.target.value)}
        onSendCode={sendCode}
        onVerifyCode={verifyCode}
        onResetPassword={resetPassword}
      />
    </Modal>
  );
}

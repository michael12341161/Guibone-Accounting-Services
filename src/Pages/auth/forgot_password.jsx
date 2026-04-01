import React, { useEffect, useMemo, useState } from "react";
import ForgotPasswordForm from "../../components/auth/ForgotPasswordForm";
import { Modal } from "../../components/UI/modal";
import {
  apiSession,
  DEFAULT_SECURITY_SETTINGS,
  fetchSecuritySettings,
} from "../../services/api";
import { useErrorToast } from "../../utils/feedback";
import {
  validatePasswordValue,
} from "../../utils/passwordValidation";

export default function ForgotPasswordModal({ open, onClose, defaultEmail = "" }) {
  const [step, setStep] = useState("email"); // email | code | reset
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);

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
  }, [open]);

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

  const description = useMemo(() => {
    if (step === "email") return "We'll send a verification code to your email.";
    if (step === "code") return "Enter the code we sent to your email.";
    return "Create a new password for your account.";
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
      const res = await apiSession.post("password_reset_send_code.php", {
        email: email.trim(),
      });

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
        setMessage(res.data?.message || "Password updated successfully.");
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

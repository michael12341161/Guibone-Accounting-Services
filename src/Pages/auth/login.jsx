import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { appLogo } from "../../assets/branding";
import { api, DEFAULT_SECURITY_SETTINGS, fetchSecuritySettings } from "../../services/api";
import { consumeAuthNotice, getHomePathForRole } from "../../context/AuthContext";
import { useAuth } from "../../hooks/useAuth";
import ForgotPasswordModal from "./forgot_password";
import LoginForm from "../../components/login_UI/login_form";
import { loginAnimStyles } from "../../components/login_UI/login_styles";
import LoginVisualPanel from "../../components/login_UI/login_visual_panel";
import { RouteLoadingPanel } from "../../components/layout/route_loading_panel";
import { useTheme } from "../../context/ThemeContext";
import { captureAuditContext } from "../../utils/audit";
import { showInfoToast, showSuccessToast } from "../../utils/feedback";

function createCaptcha() {
  return {
    a: Math.floor(Math.random() * 90) + 10,
    b: Math.floor(Math.random() * 9) + 1,
  };
}

function isExpiredPasswordResponse(responseData) {
  if (responseData?.password_expired) {
    return true;
  }

  const message = String(responseData?.message || "").trim().toLowerCase();
  return message.includes("password has expired");
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState(() => createCaptcha());
  const [sum, setSum] = useState("");
  const [loginError, setLoginError] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotDefaultEmail, setForgotDefaultEmail] = useState("");
  const [forgotPasswordExpiryDaysOverride, setForgotPasswordExpiryDaysOverride] = useState(null);
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);

  const clearErrorTimerRef = useRef(null);
  const usernameRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, login, isAuthReady } = useAuth();
  const { isDarkMode } = useTheme();
  const isAuthenticated = !!(user && (user.username || user.id));
  const isLoginVerificationEnabled = !!securitySettings.loginVerificationEnabled;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
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

    void loadSecuritySettings();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    void captureAuditContext();
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!isAuthenticated && usernameRef.current) {
      usernameRef.current.focus();
      return;
    }

    if (isAuthenticated) {
      navigate(getHomePathForRole(user || role), { replace: true });
    }
  }, [isAuthReady, isAuthenticated, navigate, role, user]);

  useEffect(() => {
    return () => {
      if (clearErrorTimerRef.current) {
        clearTimeout(clearErrorTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isLoginVerificationEnabled) {
      return;
    }

    setCaptchaError("");
    setSum("");
  }, [isLoginVerificationEnabled]);

  useEffect(() => {
    const pendingAuthNotice = consumeAuthNotice();
    const flashMessage = String(location.state?.flashMessage || pendingAuthNotice?.message || "").trim();
    if (!flashMessage) {
      return undefined;
    }

    const flashType = location.state?.flashType || pendingAuthNotice?.type || "success";
    if (flashType === "warning") {
      showInfoToast({
        title: "Notice",
        description: flashMessage,
        id: "login-flash-message",
        duration: 3200,
      });
    } else {
      showSuccessToast({
        title: "Ready to sign in",
        description: flashMessage,
        id: "login-flash-message",
        duration: 3200,
      });
    }

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: null,
      }
    );
  }, [location.hash, location.pathname, location.search, location.state?.flashMessage, location.state?.flashType, navigate]);

  const clearLoginErrorSoon = () => {
    if (clearErrorTimerRef.current) {
      clearTimeout(clearErrorTimerRef.current);
    }

    clearErrorTimerRef.current = setTimeout(() => {
      setLoginError("");
      clearErrorTimerRef.current = null;
    }, 3500);
  };

  const regenerateCaptcha = () => {
    setCaptcha(createCaptcha());
    setSum("");
    setCaptchaError("");
  };

  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
    if (loginError) {
      setLoginError("");
    }
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
    if (loginError) {
      setLoginError("");
    }
  };

  const handleSumChange = (event) => {
    setSum(event.target.value.replace(/\D/g, ""));
    if (captchaError) {
      setCaptchaError("");
    }
  };

  const openForgotPasswordModal = (responseData = {}) => {
    setForgotDefaultEmail(String(responseData?.email || username || "").trim());
    setForgotPasswordExpiryDaysOverride(
      responseData?.password_expiry_days ?? securitySettings?.passwordExpiryDays ?? null
    );
    setForgotOpen(true);
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (isLoginVerificationEnabled && parseInt(sum, 10) !== captcha.a + captcha.b) {
      setCaptchaError("Incorrect answer to the math question.");
      setPassword("");
      setCaptcha(createCaptcha());
      setSum("");
      return;
    }

    setCaptchaError("");
    setLoginError("");
    setLoading(true);

    try {
      const auditContext = await captureAuditContext().catch(() => null);
      const res = await api.post("login.php", {
        username,
        password,
        audit_context: auditContext,
      });

      if (res.data?.success) {
        const nextUser = res.data.user;
        showSuccessToast({
          title: "Login successful",
          description: "Redirecting to your dashboard...",
          id: "login-submit-status",
          duration: 2000,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        login(nextUser);
        navigate(getHomePathForRole(nextUser), { replace: true });
      } else {
        const responseData = res.data || {};
        setLoginError(responseData?.message || "Incorrect email or password");

        if (isExpiredPasswordResponse(responseData)) {
          openForgotPasswordModal(responseData);
        }

        setPassword("");
        if (isLoginVerificationEnabled) {
          regenerateCaptcha();
        }
        clearLoginErrorSoon();
      }
    } catch (err) {
      const responseData = err?.response?.data || {};
      setLoginError(responseData?.message || "Login failed");

      if (isExpiredPasswordResponse(responseData)) {
        openForgotPasswordModal(responseData);
      }

      setPassword("");
      if (isLoginVerificationEnabled) {
        regenerateCaptcha();
      }
      clearLoginErrorSoon();
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <RouteLoadingPanel />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_25%),linear-gradient(180deg,_#f8fafc_0%,_#ecfdf5_100%)]"
      }`}
    >
      <style>{loginAnimStyles}</style>

      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <LoginVisualPanel />

        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="login-fade-up w-full max-w-md">
            <div className="mb-6 flex items-center justify-start">
              <Link
                to="/"
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Back to Home
              </Link>
            </div>

            <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
              <img src={appLogo} alt="Guibone Accounting Services" className="h-12 w-12 rounded-xl object-contain" />
              <div className="text-base font-semibold text-slate-800">Guibone Accounting Services</div>
            </div>

            <LoginForm
              username={username}
              password={password}
              showPassword={showPassword}
              sum={sum}
              captcha={captcha}
              showVerification={isLoginVerificationEnabled}
              loginError={loginError}
              captchaError={captchaError}
              loading={loading}
              usernameRef={usernameRef}
              onSubmit={onSubmit}
              onUsernameChange={handleUsernameChange}
              onPasswordChange={handlePasswordChange}
              onTogglePassword={() => setShowPassword((value) => !value)}
              onSumChange={handleSumChange}
              onRefreshCaptcha={regenerateCaptcha}
              onOpenForgotPassword={() => {
                setForgotDefaultEmail(String(username || "").trim());
                setForgotPasswordExpiryDaysOverride(securitySettings?.passwordExpiryDays ?? null);
                setForgotOpen(true);
              }}
              createAccountHref="/sign-up"
            />

            <ForgotPasswordModal
              open={forgotOpen}
              onClose={() => {
                setForgotOpen(false);
                setForgotPasswordExpiryDaysOverride(null);
              }}
              defaultEmail={forgotDefaultEmail}
              passwordExpiryDaysOverride={forgotPasswordExpiryDaysOverride}
              securitySettingsOverride={securitySettings}
            />

            <p className="mt-6 text-center text-xs text-slate-500">
              By continuing, you agree to our <span className="text-slate-600">Terms</span> and{" "}
              <span className="text-slate-600">Privacy Policy</span>.
            </p>

            <p className="mt-3 text-center text-xs text-slate-500">
              Client accounts sign in using the email address submitted during registration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

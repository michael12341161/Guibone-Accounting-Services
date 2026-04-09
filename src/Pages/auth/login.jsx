import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { appLogo } from "../../assets/branding";
import { api } from "../../services/api";
import { getHomePathForRole } from "../../context/AuthContext";
import { useAuth } from "../../hooks/useAuth";
import ForgotPasswordModal from "./forgot_password";
import LoginForm from "../../components/login_UI/login_form";
import { loginAnimStyles } from "../../components/login_UI/login_styles";
import LoginVisualPanel from "../../components/login_UI/login_visual_panel";
import { useTheme } from "../../context/ThemeContext";
import { captureAuditContext } from "../../utils/audit";

function createCaptcha() {
  return {
    a: Math.floor(Math.random() * 90) + 10,
    b: Math.floor(Math.random() * 9) + 1,
  };
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
  const [flash, setFlash] = useState({ message: "", type: "success" });

  const clearErrorTimerRef = useRef(null);
  const clearFlashTimerRef = useRef(null);
  const usernameRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, login } = useAuth();
  const { isDarkMode } = useTheme();
  const isAuthenticated = !!(user && (user.username || user.id));

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    void captureAuditContext();
  }, []);

  useEffect(() => {
    if (!isAuthenticated && usernameRef.current) {
      usernameRef.current.focus();
      return;
    }

    if (isAuthenticated) {
      navigate(getHomePathForRole(role), { replace: true });
    }
  }, [isAuthenticated, navigate, role]);

  useEffect(() => {
    return () => {
      if (clearErrorTimerRef.current) {
        clearTimeout(clearErrorTimerRef.current);
      }
      if (clearFlashTimerRef.current) {
        clearTimeout(clearFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const flashMessage = String(location.state?.flashMessage || "").trim();
    if (!flashMessage) {
      return undefined;
    }

    const flashType = location.state?.flashType || "success";
    setFlash({ message: flashMessage, type: flashType });

    if (clearFlashTimerRef.current) {
      clearTimeout(clearFlashTimerRef.current);
    }

    clearFlashTimerRef.current = setTimeout(() => {
      setFlash({ message: "", type: "success" });
      clearFlashTimerRef.current = null;
    }, 3000);

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

  const onSubmit = async (event) => {
    event.preventDefault();

    if (parseInt(sum, 10) !== captcha.a + captcha.b) {
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
        login(nextUser);
        navigate(getHomePathForRole(nextUser?.role_id));
      } else {
        const responseData = res.data || {};
        setLoginError(responseData?.message || "Incorrect email or password");

        if (responseData?.password_expired) {
          setForgotDefaultEmail(String(responseData?.email || "").trim());
          setForgotOpen(true);
        }

        setPassword("");
        regenerateCaptcha();
        clearLoginErrorSoon();
      }
    } catch (err) {
      const responseData = err?.response?.data || {};
      setLoginError(responseData?.message || "Login failed");

      if (responseData?.password_expired) {
        setForgotDefaultEmail(String(responseData?.email || "").trim());
        setForgotOpen(true);
      }

      setPassword("");
      regenerateCaptcha();
      clearLoginErrorSoon();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_25%),linear-gradient(180deg,_#f8fafc_0%,_#ecfdf5_100%)]"
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: loginAnimStyles }} />

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

            {flash.message ? (
              <div
                className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
                  flash.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {flash.message}
              </div>
            ) : null}

            <LoginForm
              username={username}
              password={password}
              showPassword={showPassword}
              sum={sum}
              captcha={captcha}
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
                setForgotOpen(true);
              }}
              createAccountHref="/sign-up"
            />

            <ForgotPasswordModal
              open={forgotOpen}
              onClose={() => setForgotOpen(false)}
              defaultEmail={forgotDefaultEmail}
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

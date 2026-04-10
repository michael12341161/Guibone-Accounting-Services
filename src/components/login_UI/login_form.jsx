import React from "react";
import { Link } from "react-router-dom";
import AuthButton from "./auth_button";
import AuthInput from "./auth_input";
import LoginCaptcha from "./login_captcha";

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
      <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5a10.45 10.45 0 0 0 4.703-1.098M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="h-4 w-4">
      <path d="M10 17a1 1 0 0 1-.707-1.707L12.586 12 9.293 8.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4A.997.997 0 0 1 10 17Z" />
      <path d="M4 12a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
      <path d="M14 3h2a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5h-2a1 1 0 1 1 0-2h2a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2a1 1 0 1 1 0-2Z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="mt-0.5 h-4 w-4 flex-none">
      <path
        fillRule="evenodd"
        d="M2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75 2.25 17.385 2.25 12Zm9-4.5a.75.75 0 0 1 1.5 0v5.25a.75.75 0 0 1-1.5 0V7.5Zm.75 9a.938.938 0 1 0 0-1.876.938.938 0 0 0 0 1.876Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function LoginForm({
  username,
  password,
  showPassword,
  sum,
  captcha,
  showVerification = true,
  loginError,
  captchaError,
  loading,
  usernameRef,
  onSubmit,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onSumChange,
  onRefreshCaptcha,
  onOpenForgotPassword,
  createAccountHref = "/sign-up",
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_90px_-60px_rgba(15,23,42,0.65)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.10),_transparent_40%)]" />

      <div className="relative border-b border-slate-200 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue to your account.</p>
      </div>

      <form className="relative space-y-5 p-6 sm:p-8" onSubmit={onSubmit}>
        <AuthInput
          id="username"
          inputRef={usernameRef}
          label="Email"
          value={username}
          onChange={onUsernameChange}
          placeholder="Enter your email"
          rightAdornment={
            <span className="pointer-events-none text-slate-400">
              <UserIcon />
            </span>
          }
        />

        <AuthInput
          id="password"
          type={showPassword ? "text" : "password"}
          label="Password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Enter your password"
          rightAdornment={
            <button
              type="button"
              onClick={onTogglePassword}
              className="rounded-lg px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          }
        />

        <div className="-mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onOpenForgotPassword}
            className="text-xs font-semibold text-emerald-700 transition hover:text-emerald-800 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        {showVerification ? (
          <LoginCaptcha
            a={captcha.a}
            b={captcha.b}
            sum={sum}
            error={captchaError}
            onChange={onSumChange}
            onRefresh={onRefreshCaptcha}
          />
        ) : null}

        {loginError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <ErrorIcon />
            <p>{loginError}</p>
          </div>
        ) : null}

        <AuthButton type="submit" fullWidth loading={loading} loadingText="Signing in..." className="py-3.5">
          <span>Login</span>
          <ArrowRightIcon />
        </AuthButton>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">New here?</p>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <Link
          to={createAccountHref}
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
        >
          Create Account
        </Link>
      </form>
    </div>
  );
}

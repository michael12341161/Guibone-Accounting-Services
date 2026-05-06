import React from "react";
import { appLogo } from "../../assets/branding";

export default function LoginVisualPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-emerald-900 to-teal-600 lg:flex">
      <div className="login-aurora absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.30),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.20),transparent_50%),radial-gradient(circle_at_40%_85%,rgba(255,255,255,0.18),transparent_55%)]" />

      <div className="absolute inset-0 opacity-20">
        <div className="login-blob absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white" />
        <div className="login-blob absolute -right-28 top-1/3 h-80 w-80 rounded-full bg-white" />
        <div className="login-blob absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-white" />
      </div>

      <div className="relative z-10 flex w-full flex-col justify-between p-7">
        <div className="login-fade-up flex items-center gap-2.5">
          <img
            src={appLogo}
            alt="Guibone Accounting Services"
            className="h-10 w-10 rounded-lg bg-white/10 object-contain p-1.5"
          />
          <div>
            <div className="text-sm font-semibold tracking-tight text-white">Guibone Accounting Services</div>
            <div className="text-[11px] text-white/80">Secure portal access</div>
          </div>
        </div>

        <div className="login-fade-up-2 max-w-sm">
          <h2 className="text-xl font-semibold leading-tight text-white">Access your role-based workspace.</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-white/80">
            Sign in to manage client records, appointments, schedules, and task updates from one organized dashboard.
          </p>
        </div>

        <div className="login-fade-up-3 text-[11px] text-white/70">&copy; {new Date().getFullYear()} Guibone Accounting Services</div>
      </div>
    </div>
  );
}

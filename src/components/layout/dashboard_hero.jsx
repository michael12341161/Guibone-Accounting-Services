import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { getUserFirstName } from "./layout_utils";

export default function DashboardHero({ user }) {
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const tick = () => setCurrentDateTime(new Date());
    tick();

    const intv = window.setInterval(tick, 1000);
    return () => window.clearInterval(intv);
  }, []);

  const dashboardDateTime = useMemo(() => {
    const date = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(currentDateTime);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(currentDateTime);

    return { date, time };
  }, [currentDateTime]);
  const firstName = useMemo(() => getUserFirstName(user), [user]);
  const heading = firstName ? `Welcome, ${firstName}` : "Welcome";

  return (
    <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(120deg,_rgba(248,250,252,0.98)_0%,_rgba(255,255,255,0.96)_38%,_rgba(219,234,254,0.95)_100%)] px-6 py-7 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-[linear-gradient(120deg,_rgba(15,23,42,0.98)_0%,_rgba(17,24,39,0.96)_40%,_rgba(30,41,59,0.96)_100%)] sm:px-9 sm:py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.92),_transparent_30%),radial-gradient(circle_at_right,_rgba(147,197,253,0.35),_transparent_38%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_28%),radial-gradient(circle_at_right,_rgba(56,189,248,0.18),_transparent_34%)]" />
      <div className="absolute -left-6 top-0 h-24 w-24 rounded-full bg-white/60 blur-3xl dark:bg-sky-400/10" />
      <div className="absolute right-0 top-0 h-full w-40 bg-[radial-gradient(circle_at_center,_rgba(191,219,254,0.45),_transparent_68%)] dark:bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.16),_transparent_68%)]" />

      <div className="relative">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-5xl">
          {heading}
        </h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/88 px-4 py-2.5 text-sm text-slate-700 shadow-sm shadow-slate-200/70 backdrop-blur-sm dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:shadow-none">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
            <span className="font-semibold text-slate-900 dark:text-slate-50">Today</span>
            <span className="text-slate-500 dark:text-slate-300">- {dashboardDateTime.date}</span>
          </div>

          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/88 px-4 py-2.5 text-sm text-slate-700 shadow-sm shadow-slate-200/70 backdrop-blur-sm dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:shadow-none">
            <Clock3 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            <span className="font-semibold text-slate-900 dark:text-slate-50">Time</span>
            <span className="text-slate-500 dark:text-slate-300">- {dashboardDateTime.time}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

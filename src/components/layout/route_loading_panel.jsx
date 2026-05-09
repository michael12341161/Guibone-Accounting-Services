import React from "react";

export function RouteLoadingPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px]" />
      <div className="relative p-6">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin"
            aria-label="Loading"
          />
          <div>
            <div className="text-sm font-semibold text-slate-800">Loading...</div>
            <div className="text-xs text-slate-500">Preparing the next view</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="h-4 w-1/3 rounded bg-slate-100 animate-pulse" />
            <div className="mt-3 h-8 w-2/3 rounded bg-slate-100 animate-pulse" />
            <div className="mt-4 h-3 w-5/6 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="h-4 w-1/4 rounded bg-slate-100 animate-pulse" />
            <div className="mt-3 h-8 w-1/2 rounded bg-slate-100 animate-pulse" />
            <div className="mt-4 h-3 w-4/5 rounded bg-slate-100 animate-pulse" />
            <div className="mt-2 h-3 w-3/5 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

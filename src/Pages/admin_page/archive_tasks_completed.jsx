import React from "react";
import { Card, CardContent } from "../../components/UI/card";

const priorityClass = (priorityRaw) => {
  const value = String(priorityRaw || "Low").trim().toLowerCase();
  if (value === "high") return "bg-rose-500 text-white";
  if (value === "medium") return "bg-amber-500 text-white";
  return "bg-emerald-500 text-white";
};

export default function ArchiveTasksCompleted({ tasks = [] }) {
  const rows = Array.isArray(tasks) ? tasks : [];

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
        No tasks in archive.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Task Archive</div>
          <div className="text-xs text-slate-500">These are the tasks moved out of the current admin to-do list.</div>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          {rows.length} {rows.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((task) => (
          <Card key={task.id} compact variant="success" className="shadow-none">
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Archived
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {task.statusLabel || "Pending"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{task.title}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {task.clientName} | {task.serviceName}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>
                    {task.priority}
                  </span>
                  <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                    Due: {task.dueDateLabel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Assigned To</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{task.accountantName}</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Steps</div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {task.stepCount} {task.stepCount === 1 ? "step" : "steps"}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Description</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-700">
                  {task.description || "No additional description."}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import React from "react";
import { formatStepDateTime } from "../../utils/task_step_metadata";
import { resolveTaskStepFileUrl, STEP_FILE_ACCEPT } from "../../utils/task_step_activity";

function Spinner() {
  return (
    <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
  );
}

function ActivityItem({ activity }) {
  const type = String(activity?.type || "").toLowerCase();
  const actorName = String(activity?.actor?.name || activity?.actor_name || "User").trim();
  const actorRole = String(activity?.actor?.role || activity?.role || "").trim();
  const timestamp = formatStepDateTime(activity?.created_at);

  if (type === "file") {
    const file = activity?.file || {};
    const fileName = String(file?.name || "Uploaded file").trim();
    const fileUrl = resolveTaskStepFileUrl(file?.path);
    return (
      <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 break-words font-semibold text-slate-700">
            {actorName}
            {actorRole ? <span className="font-normal text-slate-500"> - {actorRole}</span> : null}
          </div>
          {timestamp ? <div className="shrink-0 text-[11px] text-slate-500">{timestamp}</div> : null}
        </div>
        {fileUrl ? (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex min-w-0 max-w-full items-center gap-1 font-medium text-indigo-700 hover:text-indigo-800"
          >
            <span className="truncate">{fileName}</span>
          </a>
        ) : (
          <div className="mt-1 break-words text-slate-700">{fileName}</div>
        )}
      </div>
    );
  }

  if (type === "read") {
    return null;
  }

  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 break-words font-semibold text-slate-700">
          {actorName}
          {actorRole ? <span className="font-normal text-slate-500"> - {actorRole}</span> : null}
        </div>
        {timestamp ? <div className="shrink-0 text-[11px] text-slate-500">{timestamp}</div> : null}
      </div>
      <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words pr-1 leading-5 text-slate-700">
        {activity?.text || ""}
      </div>
    </div>
  );
}

export default function TaskStepActivityControls({
  activities = [],
  canMarkRead = false,
  canRespond = false,
  canUpload = false,
  clientResponseBlocked = false,
  continueAt = "",
  continueValue = "",
  disabled = false,
  file = null,
  markReadSaving = false,
  onContinueChange,
  onFileChange,
  onMarkRead,
  onResponseChange,
  onSendResponse,
  onUploadFile,
  readAt = "",
  responseSaving = false,
  responseValue = "",
  uploadSaving = false,
}) {
  const visibleActivities = (Array.isArray(activities) ? activities : []).filter(
    (activity) => String(activity?.type || "").toLowerCase() !== "read"
  );
  const readLabel = formatStepDateTime(readAt);
  const continueLabel = formatStepDateTime(continueAt);

  if (!canMarkRead && !canRespond && !canUpload && visibleActivities.length === 0 && !readLabel && !continueLabel) {
    return clientResponseBlocked ? (
      <div className="mt-2 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs break-words text-slate-500">
        Responses open after this step is marked as read.
      </div>
    ) : null;
  }

  return (
    <div className="mt-3 max-h-80 max-w-full space-y-2 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
      {readLabel || continueLabel ? (
        <div className="flex min-w-0 flex-wrap gap-2 text-[11px] font-medium">
          {readLabel ? (
            <span className="max-w-full rounded-full bg-emerald-100 px-2 py-1 break-words text-emerald-700">
              Read {readLabel}
            </span>
          ) : null}
          {continueLabel ? (
            <span className="max-w-full rounded-full bg-sky-100 px-2 py-1 break-words text-sky-700">
              Continue {continueLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {canMarkRead ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_max-content] sm:items-end">
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold text-slate-600">Continue date and time</span>
            <input
              type="datetime-local"
              value={continueValue}
              onChange={(event) => onContinueChange?.(event.target.value)}
              disabled={disabled || markReadSaving}
              className="mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </label>
          <button
            type="button"
            onClick={onMarkRead}
            disabled={disabled || markReadSaving}
            className="inline-flex min-w-0 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {markReadSaving ? <Spinner /> : null}
            <span>{readLabel ? "Update Read" : "Mark as Read"}</span>
          </button>
        </div>
      ) : null}

      {clientResponseBlocked ? (
        <div className="max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs break-words text-slate-500">
          Responses open after this step is marked as read.
        </div>
      ) : null}

      {canRespond ? (
        <div>
          <textarea
            value={responseValue}
            onChange={(event) => onResponseChange?.(event.target.value)}
            rows={2}
            placeholder="Write a response..."
            disabled={disabled || responseSaving}
            className="max-h-24 min-h-[3.75rem] w-full min-w-0 resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onSendResponse}
              disabled={disabled || responseSaving || !String(responseValue || "").trim()}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {responseSaving ? <Spinner /> : null}
              <span>Send Response</span>
            </button>
          </div>
        </div>
      ) : null}

      {canUpload ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_max-content] sm:items-center">
          <input
            type="file"
            accept={STEP_FILE_ACCEPT}
            onChange={(event) => onFileChange?.(event.target.files?.[0] || null)}
            disabled={disabled || uploadSaving}
            className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-70"
          />
          <button
            type="button"
            onClick={onUploadFile}
            disabled={disabled || uploadSaving || !file}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {uploadSaving ? <Spinner /> : null}
            <span>Upload File</span>
          </button>
        </div>
      ) : null}

      {visibleActivities.length > 0 ? (
        <div className="max-h-40 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {visibleActivities.map((activity, index) => (
            <ActivityItem key={`${activity?.created_at || "activity"}-${index}`} activity={activity} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

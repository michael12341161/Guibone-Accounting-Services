import React from "react";

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m0 0-1.763 1.763A8.25 8.25 0 1 0 20.25 12" />
    </svg>
  );
}

export default function LoginCaptcha({ a, b, sum, error, onChange, onRefresh }) {
  const hasAnswer = sum !== "";
  const expectedAnswer = String(a + b);
  const isCorrectAnswer = hasAnswer && sum === expectedAnswer;
  const isPotentialAnswer = hasAnswer && expectedAnswer.startsWith(sum);
  const isWrongAnswer = hasAnswer && !isCorrectAnswer && !isPotentialAnswer;
  const answerInputClassName = error || isWrongAnswer
    ? "border-rose-400 text-rose-700 focus:border-rose-500 focus:ring-rose-500/15"
    : isCorrectAnswer
      ? "border-emerald-400 bg-emerald-50 text-emerald-700 focus:border-emerald-500 focus:ring-emerald-500/15"
      : "border-slate-300 text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <div className="mr-1 text-xs font-medium text-slate-600">Verification</div>

        <div className="ml-auto flex items-center gap-2">
          <input
            readOnly
            value={a}
            className="h-9 w-12 rounded-lg border border-slate-300 bg-white text-center text-xs text-slate-700 shadow-sm"
          />
          <span className="text-xs font-medium text-slate-400">+</span>
          <input
            readOnly
            value={b}
            className="h-9 w-12 rounded-lg border border-slate-300 bg-white text-center text-xs text-slate-700 shadow-sm"
          />
          <span className="text-xs font-medium text-slate-400">=</span>
          <input
            value={sum}
            onChange={onChange}
            inputMode="numeric"
            aria-invalid={Boolean(error || isWrongAnswer)}
            className={`h-9 w-16 rounded-lg border text-center text-sm shadow-sm outline-none focus:ring-4 ${answerInputClassName}`}
          />
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Refresh captcha"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../UI/modal";

function getAccountantSpecialization(accountant) {
  return String(accountant?.employee_specialization_type_name || "").trim();
}

function getAccountantDisplayName(accountant, fallbackValue = "") {
  const name = String(accountant?.username || accountant?.email || "").trim();
  if (name) return name;

  const id = String(accountant?.id ?? fallbackValue ?? "").trim();
  return id ? `User #${id}` : "Accountant";
}

export default function PartnerAccountantPicker({
  accountants,
  value,
  onChange,
  serviceName = "",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  const selectedAccountant = useMemo(() => {
    return (Array.isArray(accountants) ? accountants : []).find(
      (accountant) => String(accountant?.id || "") === String(value || "")
    );
  }, [accountants, value]);

  const filteredAccountants = useMemo(() => {
    const list = Array.isArray(accountants) ? accountants : [];
    const query = String(search || "").trim().toLowerCase();
    if (!query) return list;

    return list.filter((accountant) => {
      const name = getAccountantDisplayName(accountant);
      const email = String(accountant?.email || "").trim();
      const specialization = getAccountantSpecialization(accountant);
      return `${name} ${email} ${specialization}`.toLowerCase().includes(query);
    });
  }, [accountants, search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return undefined;
    }

    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 220);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!disabled) return undefined;
    setOpen(false);
    return undefined;
  }, [disabled]);

  const selectedSpecialization = getAccountantSpecialization(selectedAccountant);
  const buttonLabel = selectedAccountant
    ? getAccountantDisplayName(selectedAccountant, value)
    : "Select accountant partner";
  const buttonMeta = selectedAccountant
    ? selectedSpecialization || "Accountant"
    : serviceName
      ? `Choose a partner accountant for ${serviceName}.`
      : "Choose an accountant partner from the list.";
  const hasSearch = Boolean(String(search || "").trim());
  const emptyMessage = serviceName
    ? hasSearch
      ? `No accountant partners match your search for ${serviceName}.`
      : `No accountant partners are available for ${serviceName}.`
    : hasSearch
      ? "No accountant partners match your search."
      : "No accountant partners are available right now.";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setOpen(true);
          }
        }}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
          value ? "border-slate-300 bg-white text-slate-900" : "border-slate-300 bg-white text-slate-500"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              <path d="M6 20a6 6 0 0 1 12 0" />
              <path d="M18 8h4" />
              <path d="M20 6v4" />
            </svg>
          </span>

          <span className="min-w-0">
            <span className={`block truncate font-medium ${value ? "text-slate-800" : "text-slate-500"}`}>
              {buttonLabel}
            </span>
            <span className="block truncate text-xs text-slate-500">{buttonMeta}</span>
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Select partner accountant"
        description="Partner Accountant"
        size="sm"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {serviceName ? `${serviceName} specialists` : "Available specialists"}
            </div>
            <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              {filteredAccountants.length}
            </div>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search accountant partner..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {filteredAccountants.length > 0 ? (
              filteredAccountants.map((accountant) => {
                const isSelected = String(accountant?.id || "") === String(value || "");
                const name = getAccountantDisplayName(accountant);
                const specialization = getAccountantSpecialization(accountant);

                return (
                  <button
                    key={String(accountant?.id || name)}
                    type="button"
                    onClick={() => {
                      onChange?.(String(accountant?.id || ""));
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                        : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{name}</div>
                        {specialization ? (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {specialization}
                          </span>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {specialization ? "Accountant specialization match" : "Accountant"}
                      </div>
                    </div>

                    {isSelected ? (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-indigo-600 px-2 text-[11px] font-semibold text-white">
                        Selected
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}





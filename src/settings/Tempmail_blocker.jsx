import React from "react";
import { Ban, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  addTempMailBlockEntry,
  fetchTempMailBlocklist,
  removeTempMailBlockEntry,
} from "../services/api";
import { formatDateTime } from "../utils/helpers";
import { showDangerConfirmDialog, showErrorToast, showSuccessToast } from "../utils/feedback";

function EntryTypeBadge({ type }) {
  const isEmail = type === "email";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        isEmail
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-indigo-200 bg-indigo-50 text-indigo-700"
      }`}
    >
      {isEmail ? "Email" : "Domain"}
    </span>
  );
}

function EntryCard({ entry, deletingId, onRemove }) {
  const deleting = deletingId === entry.id;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-all font-mono text-sm font-semibold text-slate-800">{entry.value}</div>
          <div className="mt-1 text-xs text-slate-500">{entry.created_at ? formatDateTime(entry.created_at) : "-"}</div>
        </div>
        <EntryTypeBadge type={entry.type} />
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry)}
        disabled={deleting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {deleting ? "Removing..." : "Remove"}
      </button>
    </div>
  );
}

export default function TempMailBlockerSection() {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState("");
  const [newEntry, setNewEntry] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [, setStatus] = React.useState({ type: "", text: "" });
  const deferredSearch = React.useDeferredValue(search);

  const loadEntries = React.useCallback(async () => {
    setLoading(true);
    setStatus((current) => (current.type === "success" ? current : { type: "", text: "" }));

    try {
      const response = await fetchTempMailBlocklist();
      setEntries(response?.data?.entries || []);
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to load temp mail blocklist.";
      setStatus({ type: "error", text: message });
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const filteredEntries = React.useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return entries;
    }

    return entries.filter((entry) => `${entry.value} ${entry.type}`.toLowerCase().includes(query));
  }, [deferredSearch, entries]);

  const handleAdd = async (event) => {
    event.preventDefault();
    const value = newEntry.trim();
    if (!value) {
      const message = "Enter an email address or domain to block.";
      setStatus({ type: "error", text: message });
      showErrorToast(message);
      return;
    }

    setSaving(true);
    setStatus({ type: "", text: "" });

    try {
      const response = await addTempMailBlockEntry(value);
      setEntries(response?.data?.entries || []);
      setNewEntry("");
      const message = response?.data?.message || "Blocked entry added.";
      setStatus({ type: "success", text: message });
      showSuccessToast(message);
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to add blocked entry.";
      setStatus({ type: "error", text: message });
      showErrorToast(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (entry) => {
    const confirmation = await showDangerConfirmDialog({
      title: "Remove blocked entry?",
      text: `${entry.value} will be allowed unless MailChecker blocks it separately.`,
      confirmButtonText: "Remove",
    });
    if (!confirmation.isConfirmed) {
      return;
    }

    setDeletingId(entry.id);
    setStatus({ type: "", text: "" });

    try {
      const response = await removeTempMailBlockEntry(entry.id);
      setEntries(response?.data?.entries || []);
      const message = response?.data?.message || "Blocked entry removed.";
      setStatus({ type: "success", text: message });
      showSuccessToast(message);
    } catch (error) {
      const message = error?.response?.data?.message || "Unable to remove blocked entry.";
      setStatus({ type: "error", text: message });
      showErrorToast(message);
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Temp Mail Blocker</h3>
            <p className="mt-1 text-sm text-slate-500">
              Manage disallowed email addresses and domains used during registration and login.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Ban className="h-4 w-4 text-rose-500" aria-hidden />
            {entries.length} blocked
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-5">
        <form onSubmit={handleAdd} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="temp-mail-entry" className="block text-sm font-medium text-slate-700">
              Email or domain
            </label>
            <input
              id="temp-mail-entry"
              type="text"
              value={newEntry}
              onChange={(event) => setNewEntry(event.target.value)}
              placeholder="gixpos.com or user@example.com"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 self-end rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {saving ? "Adding..." : "Add Block"}
          </button>
        </form>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search blocked emails or domains"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadEntries()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
            {loading
              ? "Loading blocked entries..."
              : `${filteredEntries.length} of ${entries.length} entr${entries.length === 1 ? "y" : "ies"} shown`}
          </div>

          {loading && entries.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Loading temp mail blocklist...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              {search.trim() ? "No blocked entries match your search." : "No custom blocked emails or domains yet."}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Blocked entry</th>
                      <th className="w-28 px-4 py-2 text-left font-medium">Type</th>
                      <th className="w-48 px-4 py-2 text-left font-medium">Added</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEntries.map((entry) => {
                      const deleting = deletingId === entry.id;
                      return (
                        <tr key={entry.id}>
                          <td className="break-all px-4 py-3 font-mono text-xs font-semibold text-slate-800">
                            {entry.value}
                          </td>
                          <td className="px-4 py-3">
                            <EntryTypeBadge type={entry.type} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {entry.created_at ? formatDateTime(entry.created_at) : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemove(entry)}
                              disabled={deleting}
                              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              {deleting ? "Removing" : "Delete"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 md:hidden">
                {filteredEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} deletingId={deletingId} onRemove={handleRemove} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

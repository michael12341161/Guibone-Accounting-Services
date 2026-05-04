import React, { useEffect, useMemo, useState } from "react";
import { AUTO_REFRESH_INTERVAL_MS } from "./autoRefreshConfig";

const DEFAULT_REFRESH_INTERVAL_MS = AUTO_REFRESH_INTERVAL_MS;
const DEFAULT_API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost/Monitoring/monitoring/backend/api/";
const LIST_KEYS = ["data", "items", "records", "rows", "tasks", "clients", "payments"];

function resolveApiUrl(endpoint) {
  const value = String(endpoint || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const base = DEFAULT_API_BASE_URL.replace(/\/+$/, "");
  const path = value.replace(/^\/+/, "");
  return `${base}/${path}`;
}

function readArrayFromPayload(payload, dataKey) {
  if (dataKey && Array.isArray(payload?.[dataKey])) {
    return payload[dataKey];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of LIST_KEYS) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  if (payload?.data && typeof payload.data === "object") {
    for (const key of LIST_KEYS) {
      if (Array.isArray(payload.data?.[key])) {
        return payload.data[key];
      }
    }
  }

  return [];
}

function firstPresent(values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function getDefaultItemKey(item, index) {
  return firstPresent([
    item?.id,
    item?.task_id,
    item?.client_id,
    item?.payment_id,
    item?.created_at,
  ]) || `record-${index}`;
}

function DefaultListItem({ item, index }) {
  const title =
    firstPresent([
      item?.title,
      item?.name,
      item?.service_name,
      item?.client_name,
      item?.email,
    ]) || `Record ${index + 1}`;
  const description = firstPresent([item?.description, item?.service, item?.status, item?.message]);
  const meta = firstPresent([item?.created_at, item?.updated_at, item?.completed_at]);

  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
      {description ? <div className="mt-1 line-clamp-2 text-sm text-slate-600">{description}</div> : null}
      {meta ? <div className="mt-2 text-xs font-medium text-slate-500">{meta}</div> : null}
    </div>
  );
}

export default function AutoRefreshDataList({
  endpoint = "task_list.php",
  dataKey = "",
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  title = "Live Data",
  emptyMessage = "No records found.",
  renderItem,
  getItemKey,
  className = "",
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const apiUrl = useMemo(() => resolveApiUrl(endpoint), [endpoint]);
  const refreshDelay = Number(intervalMs) > 0 ? Number(intervalMs) : DEFAULT_REFRESH_INTERVAL_MS;

  useEffect(() => {
    let mounted = true;
    let activeController = null;
    let requestId = 0;

    async function fetchData({ silent = false } = {}) {
      if (!apiUrl) {
        setError("Missing API endpoint.");
        setLoading(false);
        return;
      }

      if (activeController) {
        activeController.abort();
      }

      const currentRequestId = requestId + 1;
      requestId = currentRequestId;
      const controller = new AbortController();
      activeController = controller;

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await fetch(apiUrl, {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}.`);
        }

        const payload = await response.json();
        const nextItems = readArrayFromPayload(payload, dataKey);

        if (!mounted || currentRequestId !== requestId) return;

        setItems((currentItems) => {
          const currentJson = JSON.stringify(currentItems);
          const nextJson = JSON.stringify(nextItems);
          return currentJson === nextJson ? currentItems : nextItems;
        });
        setLastUpdated(new Date());
        setError("");
      } catch (err) {
        if (err?.name === "AbortError" || !mounted) return;
        setError(err?.message || "Unable to fetch data.");
      } finally {
        if (!mounted || currentRequestId !== requestId) return;
        if (activeController === controller) {
          activeController = null;
        }
        setLoading(false);
        setRefreshing(false);
      }
    }

    fetchData({ silent: false });

    const intervalId = window.setInterval(() => {
      fetchData({ silent: true });
    }, refreshDelay);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      if (activeController) {
        activeController.abort();
      }
    };
  }, [apiUrl, dataKey, refreshDelay]);

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <div className="mt-1 text-xs text-slate-500" aria-live="polite">
            {lastUpdatedLabel ? `Updated ${lastUpdatedLabel}` : "Loading data..."}
          </div>
        </div>
        {refreshing ? (
          <div className="text-xs font-medium text-emerald-700" aria-live="polite">
            Refreshing
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600">Loading data...</div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-600">{emptyMessage}</div>
      ) : (
        <ul
          className={`divide-y divide-slate-200 transition-opacity duration-200 ${
            refreshing ? "opacity-80" : "opacity-100"
          }`}
          aria-live="polite"
        >
          {items.map((item, index) => {
            const key = getItemKey ? getItemKey(item, index) : getDefaultItemKey(item, index);

            return (
              <li key={key || `record-${index}`} className="px-4 py-3 transition-colors duration-200 hover:bg-slate-50">
                {renderItem ? renderItem(item, index) : <DefaultListItem item={item} index={index} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

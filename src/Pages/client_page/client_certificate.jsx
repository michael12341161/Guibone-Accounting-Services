import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Eye, Search } from "lucide-react";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardHeader } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { useAuth } from "../../hooks/useAuth";
import { api, fetchCertificateRecord } from "../../services/api";
import { useErrorToast } from "../../utils/feedback";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";

const PREVIEW_NAVIGATION_THRESHOLD = 3;
const DEFAULT_CERTIFICATE_PAGE_SIZE = Object.freeze({
  width: 794,
  height: 1123,
});

function getCertificatePreviewPageSize(html) {
  const match = String(html || "").match(/\.sheet\{[^}]*width:(\d+)px;height:(\d+)px;/i);
  const width = Number.parseInt(match?.[1] || "", 10);
  const height = Number.parseInt(match?.[2] || "", 10);

  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_CERTIFICATE_PAGE_SIZE.width,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_CERTIFICATE_PAGE_SIZE.height,
  };
}

function useElementSize(targetRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return undefined;
    }

    const updateSize = () => {
      const nextWidth = target.clientWidth;
      const nextHeight = target.clientHeight;
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight }
      );
    };

    updateSize();

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(target);

      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [targetRef]);

  return size;
}

function CertificatePreviewFrame({ title, html, className = "", loading = "lazy", interactive = false }) {
  const containerRef = useRef(null);
  const { width: containerWidth, height: containerHeight } = useElementSize(containerRef);
  const pageSize = useMemo(() => getCertificatePreviewPageSize(html), [html]);
  const scale =
    containerWidth > 0 && containerHeight > 0
      ? Math.min(containerWidth / pageSize.width, containerHeight / pageSize.height, 1)
      : 1;
  const scaledWidth = Math.max(1, Math.round(pageSize.width * scale));
  const scaledHeight = Math.max(1, Math.round(pageSize.height * scale));

  return (
    <div
      ref={containerRef}
      className={`relative flex w-full items-center justify-center overflow-hidden bg-white ${className}`}
    >
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
      >
        <iframe
          title={title}
          srcDoc={html}
          loading={loading}
          scrolling="no"
          className={`block border-0 bg-white ${interactive ? "" : "pointer-events-none"}`}
          style={{
            width: `${pageSize.width}px`,
            height: `${pageSize.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}

function isCompletedStatus(statusText) {
  const normalized = String(statusText || "").trim().toLowerCase();
  return normalized === "completed" || normalized === "done";
}

function getTaskKey(task) {
  const rawId = task?.id ?? task?.task_id ?? task?.Task_ID;
  if (rawId != null && String(rawId).trim()) {
    return String(rawId).trim();
  }

  return [
    String(task?.name || task?.title || "certificate").trim(),
    String(task?.created_at || task?.createdAt || "").trim(),
    String(task?.accountant_name || "").trim(),
  ]
    .filter(Boolean)
    .join(":");
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const dayFirstMatch = raw.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/);
  if (!dayFirstMatch) {
    return null;
  }

  const day = parseInt(dayFirstMatch[1], 10);
  const month = parseInt(dayFirstMatch[2], 10);
  const year = parseInt(dayFirstMatch[3], 10);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "-";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDeliveryStatus(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "Issued";
  }

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compareCertificates(left, right) {
  const leftTime =
    parseDate(left.certificateIssueDate)?.getTime() ||
    parseDate(left.updatedAtRaw)?.getTime() ||
    parseDate(left.createdAtRaw)?.getTime() ||
    0;
  const rightTime =
    parseDate(right.certificateIssueDate)?.getTime() ||
    parseDate(right.updatedAtRaw)?.getTime() ||
    parseDate(right.createdAtRaw)?.getTime() ||
    0;

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return String(right.id).localeCompare(String(left.id), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function createDownloadName(entry, preview) {
  return String(preview?.certificate_id || entry?.certificateId || entry?.serviceName || "certificate")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function CertificatePreviewCard({
  entry,
  preview,
  isLoading = false,
  error = "",
  onView,
  onDownload,
  onRetry,
}) {
  const issueDateLabel = formatDate(preview?.issue_date || entry.certificateIssueDate);
  const deliveryLabel = formatDeliveryStatus(preview?.delivery_status || entry.certificateDeliveryStatus);

  return (
    <div className="h-full rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-800">{entry.serviceName}</div>
          <div className="mt-1 text-xs text-slate-500">
            Assigned accountant: <span className="font-medium text-slate-700">{entry.accountantName}</span>
          </div>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          {deliveryLabel}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white/70 p-3">
        <div className="overflow-hidden rounded-[20px] border border-slate-100 bg-white">
          {isLoading ? (
            <div className="grid h-[360px] place-items-center bg-slate-50 text-center text-sm text-slate-500">
              Loading certificate preview...
            </div>
          ) : error ? (
            <div className="grid h-[360px] place-items-center bg-rose-50/70 p-6 text-center">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-rose-700">Certificate preview could not be loaded.</div>
                <div className="text-xs leading-5 text-rose-600">{error}</div>
                <Button variant="secondary" size="sm" onClick={() => onRetry(entry.id)}>
                  Retry
                </Button>
              </div>
            </div>
          ) : preview?.html ? (
            <CertificatePreviewFrame
              title={`${entry.serviceName} certificate preview`}
              html={preview.html}
              className="h-[360px]"
            />
          ) : (
            <div className="grid h-[360px] place-items-center bg-slate-50 p-6 text-center text-sm text-slate-500">
              Certificate preview is not available for this record yet.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-500">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="font-semibold uppercase tracking-wide text-slate-400">Issued On</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">{issueDateLabel}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {entry.serviceType ? `Service: ${entry.serviceType}` : "Issued certificate"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onView(entry.id)}>
            <Eye className="h-4 w-4" />
            View
          </Button>
          <Button variant="success" size="sm" onClick={() => onDownload(entry.id)} disabled={!preview?.html || isLoading}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClientCertificatePage() {
  const { user } = useAuth();
  const previewCarouselRef = useRef(null);
  const requestedPreviewIdsRef = useRef(new Set());
  const isMountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [previewSearchTerm, setPreviewSearchTerm] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [certificatePreviewMap, setCertificatePreviewMap] = useState({});
  const [certificatePreviewLoadingMap, setCertificatePreviewLoadingMap] = useState({});
  const [certificatePreviewErrorMap, setCertificatePreviewErrorMap] = useState({});
  const [canScrollPreviewLeft, setCanScrollPreviewLeft] = useState(false);
  const [canScrollPreviewRight, setCanScrollPreviewRight] = useState(false);

  useErrorToast(error);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadCertificates({ silent } = { silent: false }) {
      try {
        if (!silent) {
          setLoading(true);
        }
        setError("");

        const sessionClientId = user?.client_id || user?.Client_ID;

        if (sessionClientId) {
          const response = await api.get("/task_list.php", {
            params: { client_id: sessionClientId },
          });
          const rows = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];

          if (!mounted) {
            return;
          }

          setTasks((current) => {
            const next = rows;
            return JSON.stringify(current) === JSON.stringify(next) ? current : next;
          });
          return;
        }

        const clientName = joinPersonName([user?.first_name, user?.middle_name, user?.last_name]);
        const response = await api.get("/task_list.php");
        const rows = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        const filteredRows = clientName
          ? rows.filter(
              (task) => normalizeNameForComparison(task?.client_name) === normalizeNameForComparison(clientName)
            )
          : rows;

        if (!mounted) {
          return;
        }

        setTasks((current) => {
          const next = filteredRows;
          return JSON.stringify(current) === JSON.stringify(next) ? current : next;
        });
      } catch (requestError) {
        if (!mounted) {
          return;
        }

        setError(requestError?.response?.data?.message || requestError?.message || "Failed to load certificates.");
      } finally {
        if (!mounted) {
          return;
        }

        setLoading(false);
      }
    }

    void loadCertificates({ silent: false });
    const intervalId = window.setInterval(() => {
      void loadCertificates({ silent: true });
    }, 8000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [user?.client_id, user?.Client_ID, user?.first_name, user?.middle_name, user?.last_name]);

  const certificateEntries = useMemo(
    () =>
      (tasks || [])
        .filter((task) => isCompletedStatus(task?.status))
        .map((task) => ({
          id: getTaskKey(task),
          taskId: Number(task?.id ?? task?.task_id ?? task?.Task_ID ?? 0) || null,
          serviceName: task?.name || task?.title || "(Unnamed service)",
          serviceType: task?.service_name || task?.service || task?.name || task?.title || "",
          accountantName: task?.accountant_name || "Unassigned",
          certificateId: String(task?.certificate_id || "").trim(),
          certificateIssueDate: String(task?.certificate_issue_date || "").trim(),
          certificateDeliveryStatus: String(task?.certificate_delivery_status || "").trim(),
          createdAtRaw: String(task?.created_at || task?.createdAt || "").trim(),
          updatedAtRaw: String(task?.updated_at || task?.updatedAt || "").trim(),
        }))
        .filter((entry) => entry.certificateId)
        .sort(compareCertificates),
    [tasks]
  );

  function fetchPreviewForEntry(entry, { force = false } = {}) {
    const previewKey = String(entry?.id || "").trim();
    const taskId = Number(entry?.taskId ?? 0);

    if (!previewKey || taskId <= 0) {
      return;
    }

    if (force) {
      requestedPreviewIdsRef.current.delete(previewKey);
    }

    if (requestedPreviewIdsRef.current.has(previewKey)) {
      return;
    }

    requestedPreviewIdsRef.current.add(previewKey);
    setCertificatePreviewLoadingMap((current) => ({ ...current, [previewKey]: true }));
    setCertificatePreviewErrorMap((current) => ({ ...current, [previewKey]: "" }));

    void fetchCertificateRecord({ client_service_id: taskId })
      .then((response) => {
        if (!isMountedRef.current) {
          return;
        }

        setCertificatePreviewMap((current) => ({
          ...current,
          [previewKey]: response?.data?.certificate || null,
        }));
      })
      .catch((requestError) => {
        if (!isMountedRef.current) {
          return;
        }

        setCertificatePreviewErrorMap((current) => ({
          ...current,
          [previewKey]:
            requestError?.response?.data?.message ||
            requestError?.message ||
            "Certificate preview could not be loaded.",
        }));
      })
      .finally(() => {
        if (!isMountedRef.current) {
          return;
        }

        setCertificatePreviewLoadingMap((current) => ({ ...current, [previewKey]: false }));
      });
  }

  useEffect(() => {
    certificateEntries.forEach((entry) => {
      const previewKey = String(entry.id);
      if (entry.taskId > 0 && !requestedPreviewIdsRef.current.has(previewKey)) {
        fetchPreviewForEntry(entry);
      }
    });
  }, [certificateEntries]);

  const normalizedPreviewSearch = previewSearchTerm.trim().toLowerCase();
  const visibleCertificateEntries = useMemo(
    () =>
      certificateEntries.filter((entry) => {
        if (!normalizedPreviewSearch) {
          return true;
        }

        const preview = certificatePreviewMap[entry.id];
        const searchValues = [
          entry.serviceName,
          entry.serviceType,
          entry.accountantName,
          entry.certificateId,
          entry.certificateIssueDate,
          preview?.certificate_id,
          preview?.client_name,
          preview?.issue_date,
          formatDeliveryStatus(preview?.delivery_status || entry.certificateDeliveryStatus),
        ];

        return searchValues.some((value) =>
          String(value || "").toLowerCase().includes(normalizedPreviewSearch)
        );
      }),
    [certificateEntries, certificatePreviewMap, normalizedPreviewSearch]
  );
  const shouldShowPreviewArrows = visibleCertificateEntries.length >= PREVIEW_NAVIGATION_THRESHOLD;

  const selectedCertificateEntry = useMemo(
    () => certificateEntries.find((entry) => String(entry.id) === String(selectedCertificateId)) || null,
    [certificateEntries, selectedCertificateId]
  );
  const selectedCertificatePreview = selectedCertificateEntry
    ? certificatePreviewMap[selectedCertificateEntry.id]
    : null;
  const selectedCertificateError = selectedCertificateEntry
    ? String(certificatePreviewErrorMap[selectedCertificateEntry.id] || "").trim()
    : "";
  const selectedCertificateLoading = selectedCertificateEntry
    ? Boolean(certificatePreviewLoadingMap[selectedCertificateEntry.id])
    : false;

  const handleViewCertificate = (entryId) => {
    setSelectedCertificateId(String(entryId));

    const targetEntry = certificateEntries.find((entry) => String(entry.id) === String(entryId));
    if (!targetEntry) {
      return;
    }

    const previewKey = String(targetEntry.id);
    if (
      !certificatePreviewMap[previewKey] &&
      !certificatePreviewLoadingMap[previewKey] &&
      !certificatePreviewErrorMap[previewKey]
    ) {
      fetchPreviewForEntry(targetEntry);
    }
  };

  const handleRetryPreview = (entryId) => {
    const targetEntry = certificateEntries.find((entry) => String(entry.id) === String(entryId));
    if (!targetEntry) {
      return;
    }

    fetchPreviewForEntry(targetEntry, { force: true });
  };

  const handleDownloadCertificate = (entryId = selectedCertificateId) => {
    const targetEntry = certificateEntries.find((entry) => String(entry.id) === String(entryId));
    if (!targetEntry) {
      return;
    }

    const preview = certificatePreviewMap[targetEntry.id];
    const html = String(preview?.html || "").trim();
    if (!html) {
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${createDownloadName(targetEntry, preview) || "certificate"}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  };

  const handlePreviewScroll = (direction) => {
    const previewCarousel = previewCarouselRef.current;
    if (!previewCarousel) {
      return;
    }

    const scrollAmount = previewCarousel.clientWidth;
    previewCarousel.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const previewCarousel = previewCarouselRef.current;

    if (!shouldShowPreviewArrows || !previewCarousel) {
      setCanScrollPreviewLeft(false);
      setCanScrollPreviewRight(false);
      return undefined;
    }

    const updatePreviewScrollState = () => {
      const maxScrollLeft = Math.max(0, previewCarousel.scrollWidth - previewCarousel.clientWidth);
      setCanScrollPreviewLeft(previewCarousel.scrollLeft > 8);
      setCanScrollPreviewRight(previewCarousel.scrollLeft < maxScrollLeft - 8);
    };

    updatePreviewScrollState();
    previewCarousel.addEventListener("scroll", updatePreviewScrollState, { passive: true });
    window.addEventListener("resize", updatePreviewScrollState);

    return () => {
      previewCarousel.removeEventListener("scroll", updatePreviewScrollState);
      window.removeEventListener("resize", updatePreviewScrollState);
    };
  }, [shouldShowPreviewArrows, visibleCertificateEntries.length]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/90 bg-white">
        <CardHeader description="Review, preview, and download the certificates issued for your completed services.">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">My Certificate</h1>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          {!loading && certificateEntries.length > 0 ? (
            <div className="mb-4 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block w-full sm:max-w-[320px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={previewSearchTerm}
                  onChange={(event) => setPreviewSearchTerm(event.target.value)}
                  placeholder="Search certificates"
                  aria-label="Search my certificates"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              {shouldShowPreviewArrows ? (
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <IconButton
                    variant="outline"
                    size="sm"
                    aria-label="Scroll certificate previews left"
                    disabled={!canScrollPreviewLeft}
                    onClick={() => handlePreviewScroll("left")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    variant="outline"
                    size="sm"
                    aria-label="Scroll certificate previews right"
                    disabled={!canScrollPreviewRight}
                    onClick={() => handlePreviewScroll("right")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
              <div className="text-base font-semibold text-slate-800">Loading certificates</div>
              <div className="mt-2 text-sm text-slate-500">
                Please wait while your issued certificates are loaded.
              </div>
            </div>
          ) : certificateEntries.length > 0 ? (
            visibleCertificateEntries.length > 0 ? (
              shouldShowPreviewArrows ? (
                <div ref={previewCarouselRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2">
                  {visibleCertificateEntries.map((entry) => (
                    <div
                      key={entry.id}
                      data-certificate-id={entry.id}
                      className="w-full shrink-0 lg:w-[calc((100%-1rem)/2)]"
                    >
                      <CertificatePreviewCard
                        entry={entry}
                        preview={certificatePreviewMap[entry.id]}
                        isLoading={Boolean(certificatePreviewLoadingMap[entry.id])}
                        error={String(certificatePreviewErrorMap[entry.id] || "").trim()}
                        onView={handleViewCertificate}
                        onDownload={handleDownloadCertificate}
                        onRetry={handleRetryPreview}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {visibleCertificateEntries.map((entry) => (
                    <CertificatePreviewCard
                      key={entry.id}
                      entry={entry}
                      preview={certificatePreviewMap[entry.id]}
                      isLoading={Boolean(certificatePreviewLoadingMap[entry.id])}
                      error={String(certificatePreviewErrorMap[entry.id] || "").trim()}
                      onView={handleViewCertificate}
                      onDownload={handleDownloadCertificate}
                      onRetry={handleRetryPreview}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
                <div className="text-base font-semibold text-slate-800">No matching certificates found</div>
                <div className="mt-2 text-sm text-slate-500">
                  Try a different search term to find an issued certificate.
                </div>
              </div>
            )
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
              <div className="text-base font-semibold text-slate-800">No certificate available yet</div>
              <div className="mt-2 text-sm text-slate-500">
                Issued certificates from your completed services will appear here automatically.
              </div>
              <Link
                to="/client/work-progress/history"
                className="mt-4 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Open History
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={Boolean(selectedCertificateEntry)}
        onClose={() => setSelectedCertificateId("")}
        title={selectedCertificateEntry ? `${selectedCertificateEntry.serviceName} Certificate` : "My Certificate"}
        description={
          selectedCertificateEntry
            ? "Open the issued certificate for this completed service and download a copy when needed."
            : undefined
        }
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => handleDownloadCertificate()}
              disabled={!selectedCertificatePreview?.html || selectedCertificateLoading}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => setSelectedCertificateId("")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </>
        }
      >
        {selectedCertificateLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            Loading certificate preview...
          </div>
        ) : selectedCertificateError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
            <div className="text-sm text-rose-700">{selectedCertificateError}</div>
            {selectedCertificateEntry ? (
              <button
                type="button"
                onClick={() => handleRetryPreview(selectedCertificateEntry.id)}
                className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : selectedCertificatePreview?.html ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <CertificatePreviewFrame
                title="Certificate preview"
                html={selectedCertificatePreview.html}
                className="h-[70vh]"
                interactive
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            Certificate preview is not available for this record yet.
          </div>
        )}
      </Modal>
    </div>
  );
}

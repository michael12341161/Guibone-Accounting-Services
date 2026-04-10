import React, { useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, Mail, MapPin, Phone, ReceiptText, ShieldCheck, Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import BusinessLocationModal from "../../components/business/BusinessLocationModal";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import {
  buildBusinessAddress,
  buildBusinessAddressDetails,
  buildBusinessSearchQueries,
  formatDisplayValue,
} from "../../utils/business_location";
import { getDocumentStatusBadgeClass } from "../../utils/document_management";
import { useErrorToast } from "../../utils/feedback";

function readStoredSessionUser() {
  try {
    const raw = localStorage.getItem("session:user");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatBusinessDate(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Not available";

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function fetchClientBusiness(clientId) {
  const [businessResponse, clientResponse] = await Promise.all([
    api.get("client_business.php", {
      params: { client_id: clientId },
    }),
    api.get("client_list.php", {
      params: { client_id: clientId },
    }),
  ]);

  const clientRecord = Array.isArray(clientResponse?.data?.clients) ? clientResponse.data.clients[0] || null : null;
  const rawStatus = String(clientRecord?.document_status || "").trim().toLowerCase();

  return {
    business: businessResponse?.data?.business ?? null,
    status:
      rawStatus === "expired"
        ? "Expired"
        : rawStatus === "registered"
          ? "Registered"
          : "Unregistered",
  };
}

function DetailCard({ icon: Icon, label, value, valueClassName = "" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-none">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className={`text-sm font-medium text-slate-900 dark:text-slate-100 ${valueClassName}`.trim()}>{value}</div>
    </div>
  );
}

export default function BusinessPage() {
  const { user: authUser } = useAuth();
  const storedUser = useMemo(() => readStoredSessionUser(), []);
  const currentUser = authUser || storedUser;
  const clientId = useMemo(
    () => toPositiveInteger(currentUser?.client_id ?? currentUser?.Client_ID),
    [currentUser?.client_id, currentUser?.Client_ID]
  );

  const [business, setBusiness] = useState(null);
  const [businessStatus, setBusinessStatus] = useState("Unregistered");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [isMapOpen, setIsMapOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadBusiness() {
      if (!clientId) {
        if (!mounted) return;
        setBusiness(null);
        setBusinessStatus("Unregistered");
        setError("Unable to load your business details because your client profile could not be identified.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const nextProfile = await fetchClientBusiness(clientId);
        if (!mounted) return;
        setBusiness(nextProfile?.business ?? null);
        setBusinessStatus(nextProfile?.status || "Unregistered");
      } catch (err) {
        if (!mounted) return;
        setBusiness(null);
        setBusinessStatus("Unregistered");
        setError(err?.response?.data?.message || err?.message || "Failed to load business details.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    void loadBusiness();

    return () => {
      mounted = false;
    };
  }, [clientId]);

  const businessName = formatDisplayValue(business?.business_trade_name || business?.business_brand, "No business profile yet");
  const businessType = formatDisplayValue(business?.business_type, "Type of business not available");
  const businessStatusBadgeClass = getDocumentStatusBadgeClass(
    businessStatus === "Registered"
      ? "Registered"
      : businessStatus === "Expired"
        ? "Expired"
        : "Pending"
  );
  const businessAddress = buildBusinessAddress(business);
  const businessAddressDetails = buildBusinessAddressDetails(business);
  const businessSearchQueries = buildBusinessSearchQueries(business);
  const detailCards = [
    {
      label: "Trade Name",
      value: businessName,
      icon: Store,
    },
    {
      label: "Type of Business",
      value: businessType,
      icon: Building2,
    },
    {
      label: "Business Status",
      value: businessStatus,
      icon: ShieldCheck,
      valueClassName:
        businessStatus === "Registered"
          ? "text-emerald-700 dark:text-emerald-300"
          : businessStatus === "Expired"
            ? "text-rose-700 dark:text-rose-300"
            : "text-amber-700 dark:text-amber-300",
    },
    {
      label: "Business Email",
      value: formatDisplayValue(business?.business_email),
      icon: Mail,
      valueClassName: "break-all",
    },
    {
      label: "Business Contact",
      value: formatDisplayValue(business?.business_contact),
      icon: Phone,
    },
    {
      label: "Business TIN",
      value: formatDisplayValue(business?.business_tin),
      icon: ReceiptText,
    },
    {
      label: "Date Added",
      value: formatBusinessDate(business?.business_date_added),
      icon: CalendarDays,
    },
  ];

  const handleOpenMap = () => {
    setIsMapOpen(true);
  };

  const handleCloseMap = () => {
    setIsMapOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] dark:border-slate-700/70 dark:bg-slate-900/95 dark:shadow-[0_28px_70px_-50px_rgba(0,0,0,0.85)]">
        <div className="relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_36%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.24),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.94))]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent dark:via-emerald-500/30" />

          <div className="relative z-10 space-y-5">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-emerald-200/70 bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                Client Business Profile
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base text-slate-950 dark:text-slate-50">Business Details</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-300">
                  View the latest business profile linked to your client account.
                </CardDescription>
              </div>
            </div>

            <div className="rounded-[28px] border border-emerald-100/80 bg-white/80 p-5 shadow-[0_18px_40px_-28px_rgba(16,185,129,0.35)] backdrop-blur-md dark:border-emerald-500/15 dark:bg-slate-950/70 dark:shadow-[0_22px_44px_-32px_rgba(0,0,0,0.8)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                    <Building2 className="h-7 w-7" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
                        Business Status
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${businessStatusBadgeClass}`}>
                        {businessStatus}
                      </span>
                    </div>
                    <div className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      {loading ? "Loading business profile..." : businessName}
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {loading
                        ? "Fetching the latest business information linked to your account."
                        : business
                        ? `Latest record on file for ${businessType}. This business is currently ${businessStatus.toLowerCase()}.`
                        : "No business details are currently saved for this account."}
                    </p>
                  </div>
                </div>

                {!loading && business ? (
                  <div className="rounded-2xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 text-left shadow-sm dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-none lg:min-w-[240px]">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Last Recorded</div>
                    <div className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      {formatBusinessDate(business?.business_date_added)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="animate-pulse dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-none">
              <div className="space-y-3">
                <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </Card>
          ))}
        </div>
      ) : business ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {detailCards.map((item) => (
              <DetailCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.value}
                valueClassName={item.valueClassName}
              />
            ))}
          </div>

          <Card>
            <CardHeader
              title="Business Address"
              description="Latest address currently saved on your profile."
              className="dark:[&_*]:border-slate-700"
            />
            <CardContent>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/70 dark:bg-slate-900/70">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={handleOpenMap}
                    disabled={!businessSearchQueries.length}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-700 dark:hover:text-emerald-300"
                    aria-label="View business on map"
                    title={businessSearchQueries.length ? "View business on map" : "No address available for map"}
                  >
                    <MapPin className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{businessAddress}</div>
                    {businessAddressDetails.length ? (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{businessAddressDetails.join(" | ")}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleOpenMap}
                      disabled={!businessSearchQueries.length}
                      className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 transition hover:text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-emerald-300 dark:hover:text-emerald-200 dark:disabled:text-slate-500"
                    >
                      <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
                      Open map
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <BusinessLocationModal
            open={isMapOpen}
            onClose={handleCloseMap}
            business={business}
            businessName={businessName}
          />
        </>
      ) : (
        <Card variant="muted" className="dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-200">
          <CardContent>
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-center dark:border-slate-700 dark:bg-slate-950/40">
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">No business details found</div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Your account does not have a saved business profile yet. Once a business record is submitted, it will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

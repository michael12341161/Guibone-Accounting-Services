import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock3, FileText, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import { getDocumentStatusBadgeClass } from "../../utils/document_management";
import { hasFeatureActionAccess, hasModuleAccess } from "../../utils/module_permissions";
import { joinPersonName } from "../../utils/person_name";
import { useErrorToast } from "../../utils/feedback";

function fullName(client) {
  return joinPersonName([client?.first_name, client?.middle_name, client?.last_name]) || "-";
}

function formatRegisteredDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getBusinessStatus(client) {
  const status = String(client?.document_status || "").trim().toLowerCase();
  if (status === "expired") return "Expired";
  if (status === "registered") return "Registered";
  return "Unregistered";
}

const PAGE_SIZE = 10;

export default function ClientBusinessStatusPage() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const documentsBasePath = useMemo(
    () => (location.pathname.startsWith("/secretary") ? "/secretary" : "/admin"),
    [location.pathname]
  );
  const canOpenDocuments = hasModuleAccess(user, "documents", permissions);
  const canUploadDocuments = hasFeatureActionAccess(user, "documents", "upload", permissions);
  const documentButtonLabel = canUploadDocuments ? "Manage Permit" : "View Documents";

  const loadClients = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoading(true);
      setError("");

      const response = await api.get("client_list.php");
      const rows = Array.isArray(response?.data?.clients) ? response.data.clients : [];
      setClients(rows);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Unable to load business status.");
      if (!silent) setClients([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    if (active) {
      void loadClients({ silent: false });
    }

    const interval = window.setInterval(() => {
      if (active) {
        void loadClients({ silent: true });
      }
    }, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const businessRows = useMemo(
    () =>
      clients.map((client) => {
        const businessStatus = getBusinessStatus(client);
        return {
          ...client,
          client_name: fullName(client),
          business_name: client?.business_trade_name || client?.business_brand || "-",
          business_status: businessStatus,
        };
      }),
    [clients]
  );

  const summary = useMemo(() => {
    const registered = businessRows.filter((row) => row.business_status === "Registered").length;
    const unregistered = businessRows.length - registered;

    return {
      total: businessRows.length,
      registered,
      unregistered,
    };
  }, [businessRows]);

  const filteredRows = useMemo(() => {
    const query = String(searchTerm || "").trim().toLowerCase();

    if (filter === "registered") {
      return businessRows.filter((row) => {
        if (row.business_status !== "Registered") return false;
        if (!query) return true;
        return [row.client_name, row.business_name, row.email]
          .some((value) => String(value || "").toLowerCase().includes(query));
      });
    }
    if (filter === "unregistered") {
      return businessRows.filter((row) => {
        if (row.business_status === "Registered") return false;
        if (!query) return true;
        return [row.client_name, row.business_name, row.email]
          .some((value) => String(value || "").toLowerCase().includes(query));
      });
    }

    return businessRows.filter((row) => {
      if (!query) return true;
      return [row.client_name, row.business_name, row.email]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [businessRows, filter, searchTerm]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageStartIndex = totalRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEndIndex = totalRows === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalRows);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, filteredRows]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const columns = useMemo(
    () => [
      {
        key: "client_name",
        header: "Client Name",
        width: "26%",
        render: (_, row) => (
          <div className="min-w-[180px]">
            <div className="font-medium text-slate-900">{row.client_name}</div>
            <div className="text-xs text-slate-500">{row.email || "No email"}</div>
          </div>
        ),
      },
      {
        key: "business_name",
        header: "Business Name",
        width: "24%",
        render: (value) => <span className="break-words">{value || "-"}</span>,
      },
      {
        key: "business_status",
        header: "Status",
        width: "16%",
        render: (value) => (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentStatusBadgeClass(
              value === "Registered" ? "Registered" : value === "Expired" ? "Expired" : "Pending"
            )}`}
          >
            {value}
          </span>
        ),
      },
      {
        key: "registered_at",
        header: "Client Since",
        width: "14%",
        render: (value) => formatRegisteredDate(value),
      },
      {
        key: "actions",
        header: "Action",
        width: "20%",
        align: "right",
        render: (_, row) => (
          <Button
            variant={row.business_status === "Registered" ? "secondary" : "success"}
            size="sm"
            disabled={!canOpenDocuments}
            onClick={(event) => {
              event.stopPropagation();
              if (!canOpenDocuments) {
                return;
              }
              navigate(`${documentsBasePath}/documents?client_id=${row.id}`);
            }}
          >
            <FileText className="h-4 w-4" />
            {documentButtonLabel}
          </Button>
        ),
      },
    ],
    [canOpenDocuments, documentButtonLabel, documentsBasePath, navigate]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Business Status"
          description="Review which client businesses are already registered and which ones still need a Business Permit."
        />
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card compact>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-slate-500">
              <Building2 className="h-4 w-4" />
              <div className="text-xs font-semibold uppercase tracking-wide">Total Businesses</div>
            </div>
            <div className="text-2xl font-semibold text-slate-900">{summary.total}</div>
            <CardDescription>All client businesses currently in the system.</CardDescription>
          </CardContent>
        </Card>

        <Card compact variant="success">
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <div className="text-xs font-semibold uppercase tracking-wide">Registered</div>
            </div>
            <div className="text-2xl font-semibold">{summary.registered}</div>
            <CardDescription>Businesses with an uploaded Business Permit.</CardDescription>
          </CardContent>
        </Card>

        <Card compact variant="warning">
          <CardContent className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700">
              <Clock3 className="h-4 w-4" />
              <div className="text-xs font-semibold uppercase tracking-wide">Unregistered</div>
            </div>
            <div className="text-2xl font-semibold">{summary.unregistered}</div>
            <CardDescription>Businesses still waiting for a permit upload or renewal.</CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Client Business List"
          description="Filter the list below to focus on registered or unregistered businesses."
        />
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                id="business-status-search"
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search businesses..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="w-full sm:w-64">
              <select
                id="business-status-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                aria-label="Filter by business status"
              >
                <option value="all">All Businesses</option>
                <option value="registered">Registered</option>
                <option value="unregistered">Unregistered</option>
              </select>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={paginatedRows}
            keyField="id"
            loading={loading}
            compact
            striped={false}
            rowHover
            stickyHeader
            maxHeight="680px"
            emptyMessage="No client businesses match the current filter."
            className="shadow-none"
          />

          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{pageStartIndex}</span>-
              <span className="font-medium">{pageEndIndex}</span> of{" "}
              <span className="font-medium">{totalRows}</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canPrev}
                onClick={() => {
                  if (canPrev) setCurrentPage((page) => page - 1);
                }}
              >
                Previous
              </Button>
              <div className="text-xs text-slate-600">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canNext}
                onClick={() => {
                  if (canNext) setCurrentPage((page) => page + 1);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

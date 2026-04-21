import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import Swal from "sweetalert2";
import PasswordRequirementsPanel from "../../components/auth/PasswordRequirementsPanel";
import BusinessAddressMapSelector from "../../components/business/BusinessAddressMapSelector";
import AddressFields from "../../components/SignUpForm/AddressFields";
import BusinessLocationModal from "../../components/business/BusinessLocationModal";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { useAddress } from "../../hooks/useAddress";
import {
  api,
  DEFAULT_SECURITY_SETTINGS,
  fetchSecuritySettings,
  requestModuleAccess,
} from "../../services/api";
import { buildBusinessAddress } from "../../utils/business_location";
import { validatePasswordValue } from "../../utils/passwordValidation";
import {
  joinPersonName,
  normalizeMiddleName,
  normalizeMiddleNameOrNull,
  normalizePersonName,
} from "../../utils/person_name";
import { showConfirmDialog, showDangerConfirmDialog, showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";
import { hasFeatureActionAccess } from "../../utils/module_permissions";

const PAGE_SIZE = 10;
const FALLBACK_BUSINESS_TYPES = [
  { id: 1, name: "Sole Proprietor" },
  { id: 2, name: "Partnership" },
  { id: 3, name: "Corporation" },
];
const FALLBACK_CIVIL_STATUS_TYPES = [
  { id: 1, name: "Single" },
  { id: 2, name: "Married" },
  { id: 3, name: "Widowed" },
  { id: 4, name: "Separated" },
  { id: 5, name: "Divorced" },
  { id: 6, name: "Annulled" },
];
const FALLBACK_DOCUMENT_TYPES = [
  { id: 1, name: "valid_id" },
  { id: 2, name: "birth_certificate" },
  { id: 3, name: "marriage_contract" },
  { id: 4, name: "business_permit" },
  { id: 5, name: "dti" },
  { id: 6, name: "sec" },
  { id: 7, name: "lgu" },
];
const CLIENT_LIST_PARAMS = { exclude_unapproved_self_signup: 1 };

function createEmptyForm() {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    civil_status_type_id: "",
    province: "",
    municipality: "",
    postal_code: "",
    barangay: "",
    street_address: "",
    tin_no: "",
    status_id: "1",
    user_password: "",
    business: {
      trade_name: "",
      business_name: "",
      business_type_id: "",
      business_province: "",
      business_municipality: "",
      business_postal_code: "",
      business_barangay: "",
      business_street_address: "",
      email_address: "",
      tin_number: "",
      contact_number: "",
      type_of_business: "",
    },
  };
}

function createEmptyAddAddress() {
  return {
    province: "",
    city: "",
    barangay: "",
    postalCode: "",
    country: "Philippines",
  };
}

function createEmptyBusinessAddress() {
  return {
    street: "",
    barangay: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Philippines",
  };
}

function getStatusPillClass(status) {
  const statusText = String(status || "-").toLowerCase();
  if (statusText === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (statusText === "-") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function resolveClientStatusId(client) {
  const statusId = Number.parseInt(String(client?.status_id ?? client?.statusId ?? "").trim(), 10);
  if (Number.isFinite(statusId) && statusId > 0) {
    return statusId;
  }

  const statusText = String(client?.status || "").trim().toLowerCase();
  if (statusText === "active") return 1;
  if (statusText === "inactive") return 2;
  return null;
}

function matchesClientStatusFilter(client, statusFilter) {
  const normalizedFilter = String(statusFilter || "").trim().toLowerCase();
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  const statusText = String(client?.status || "").trim().toLowerCase();
  const statusId = resolveClientStatusId(client);

  if (normalizedFilter === "active") {
    return statusText === "active" || statusId === 1;
  }

  if (normalizedFilter === "inactive") {
    return statusText === "inactive" || statusId === 2;
  }

  return statusText === normalizedFilter;
}

function getClientStatusPageLabel(statusId) {
  return Number(statusId) === 2 ? "Inactive Users" : "Client Management";
}

function fullName(client) {
  return joinPersonName([client?.first_name, client?.middle_name, client?.last_name]);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTin(value) {
  return String(value || "").trim();
}

function normalizeIdValue(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTradeName(client) {
  return String(client?.business_trade_name || client?.business_brand || client?.business?.trade_name || "").trim();
}

function getBusinessLocation(client) {
  return buildBusinessAddress(client);
}

function hasBusinessDetails(business) {
  return [
    business?.trade_name,
    business?.business_street_address,
    business?.business_barangay,
    business?.business_municipality,
    business?.business_province,
    business?.business_postal_code,
    business?.email_address,
    business?.tin_number,
    business?.contact_number,
    business?.business_type_id,
  ].some((value) => String(value ?? "").trim() !== "");
}

function formatDocumentTypeLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "valid_id") return "Valid ID";
  if (raw === "birth_certificate") return "PSA Birth Certificate";
  if (raw === "marriage_contract") return "Marriage Contract (if applicable)";
  if (raw === "business_permit") return "Business Permit";
  if (raw === "dti") return "DTI";
  if (raw === "sec") return "SEC";
  if (raw === "lgu") return "LGU";
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildBusinessTypeOptions(businessTypes, clients) {
  const ordered = [];
  const seen = new Set();
  const extras = [];
  const addOrdered = (value) => {
    const normalized = String(value || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  };
  const addExtra = (value) => {
    const normalized = String(value || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    extras.push(normalized);
  };

  businessTypes.forEach((option) => addOrdered(option?.name));
  clients.forEach((client) => addExtra(client?.business_type || client?.business?.business_name || ""));

  return ["All", ...ordered, ...extras.sort((a, b) => a.localeCompare(b))];
}

function buildClientPayload(values, businessTypes, overrides = {}) {
  const businessTypeId = normalizeIdValue(values?.business?.business_type_id);
  const civilStatusTypeId = normalizeIdValue(values?.civil_status_type_id);
  const selectedBusinessType = businessTypes.find((option) => String(option.id) === String(businessTypeId ?? ""));
  const includesBusinessDetails = overrides.includeBusinessDetails ?? hasBusinessDetails(values?.business);
  const province = String(overrides.province ?? values?.province ?? "").trim();
  const municipality = String(overrides.municipality ?? values?.municipality ?? "").trim();
  const postalCode = String(overrides.postalCode ?? values?.postal_code ?? "").trim();
  const barangay = String(overrides.barangay ?? values?.barangay ?? "").trim();
  const businessProvince = String(overrides.businessProvince ?? values?.business?.business_province ?? "").trim();
  const businessMunicipality = String(overrides.businessMunicipality ?? values?.business?.business_municipality ?? "").trim();
  const businessPostalCode = String(overrides.businessPostalCode ?? values?.business?.business_postal_code ?? "").trim();
  const businessBarangay = String(overrides.businessBarangay ?? values?.business?.business_barangay ?? "").trim();

  return {
    first_name: normalizePersonName(values?.first_name),
    middle_name: normalizeMiddleNameOrNull(values?.middle_name),
    last_name: normalizePersonName(values?.last_name),
    email: values?.email || null,
    phone: values?.phone || null,
    date_of_birth: values?.date_of_birth || null,
    civil_status_type_id: civilStatusTypeId,
    province: province || null,
    municipality: municipality || null,
    postal_code: postalCode || null,
    barangay: barangay || null,
    street_address: values?.street_address || null,
    tin_no: values?.tin_no || null,
    status_id: normalizeIdValue(values?.status_id) || 1,
    user_password: values?.user_password || null,
    business_details:
      includesBusinessDetails
        ? {
            trade_name: values?.business?.trade_name || values?.business?.business_name || "",
            business_type_id: businessTypeId,
            type_of_business: selectedBusinessType?.name || "",
            street_address: values?.business?.business_street_address || "",
            barangay: businessBarangay || null,
            municipality: businessMunicipality || null,
            province: businessProvince || null,
            postal_code: businessPostalCode || null,
            email_address: values?.business?.email_address || null,
            tin_number: values?.business?.tin_number || null,
            contact_number: values?.business?.contact_number || null,
          }
        : undefined,
  };
}

function AddClientModal({
  open,
  onClose,
  onSubmit,
  loading,
  error,
  canUploadRequiredDocuments,
  documentTypes,
  businessTypes,
  civilStatusTypes,
  securitySettings,
}) {
  const [documentFiles, setDocumentFiles] = useState({});
  const [addAddress, setAddAddress] = useState(createEmptyAddAddress);
  const [businessAddress, setBusinessAddress] = useState(createEmptyBusinessAddress);
  const [passwordPreview, setPasswordPreview] = useState("");
  const {
    provinceOptions,
    cityOptions,
    barangayOptions,
    selectedProvince: addSelectedProvince,
    selectedCity: addSelectedCity,
    selectedBarangay: addSelectedBarangay,
    postalCode: addPostalCode,
    handleProvinceChange: handleAddProvinceChange,
    handleCityChange: handleAddCityChange,
    handleBarangayChange: handleAddBarangayChange,
    isCityDisabled: isAddCityDisabled,
    isBarangayDisabled: isAddBarangayDisabled,
  } = useAddress({
    value: addAddress,
    onChange: setAddAddress,
  });

  const addProvinceName = useMemo(
    () => addSelectedProvince?.name || addSelectedProvince?.province_name || "",
    [addSelectedProvince]
  );
  const addMunicipalityName = useMemo(
    () => addSelectedCity?.name || addSelectedCity?.city_name || "",
    [addSelectedCity]
  );
  const addBarangayName = useMemo(
    () => addSelectedBarangay?.name || addSelectedBarangay?.brgy_name || "",
    [addSelectedBarangay]
  );
  const addPostalHelperText = useMemo(
    () =>
      addAddress.city
        ? addPostalCode
          ? "Auto-filled based on the selected province and city."
          : "Postal code unavailable for the selected city."
        : "Auto-filled once a province and city are selected.",
    [addAddress.city, addPostalCode]
  );

  useEffect(() => {
    if (open) {
      return;
    }

    setDocumentFiles({});
    setAddAddress(createEmptyAddAddress());
    setBusinessAddress(createEmptyBusinessAddress());
    setPasswordPreview("");
  }, [open]);

  const handleDocumentFileChange = useCallback((documentId, file) => {
    setDocumentFiles((prev) => ({
      ...prev,
      [documentId]: file || null,
    }));
  }, []);

  const handlePasswordChange = useCallback((event) => {
    setPasswordPreview(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);

      onSubmit({
        values: {
          first_name: String(formData.get("first_name") ?? ""),
          middle_name: String(formData.get("middle_name") ?? ""),
          last_name: String(formData.get("last_name") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          date_of_birth: String(formData.get("date_of_birth") ?? ""),
          civil_status_type_id: String(formData.get("civil_status_type_id") ?? ""),
          province: "",
          municipality: "",
          postal_code: "",
          barangay: "",
          street_address: String(formData.get("street_address") ?? ""),
          tin_no: String(formData.get("tin_no") ?? ""),
          status_id: "1",
          user_password: String(formData.get("user_password") ?? ""),
          business: {
            trade_name: String(formData.get("trade_name") ?? ""),
            business_name: "",
            business_type_id: String(formData.get("business_type_id") ?? ""),
            business_province: businessAddress.province || "",
            business_municipality: businessAddress.city || "",
            business_postal_code: businessAddress.postalCode || "",
            business_barangay: businessAddress.barangay || "",
            business_street_address: businessAddress.street || "",
            email_address: String(formData.get("email_address") ?? ""),
            tin_number: String(formData.get("tin_number") ?? ""),
            contact_number: String(formData.get("contact_number") ?? ""),
            type_of_business: "",
          },
        },
        address: {
          province: addProvinceName,
          municipality: addMunicipalityName,
          barangay: addBarangayName,
          postalCode: addPostalCode,
        },
        documentFiles,
      });
    },
    [addBarangayName, addMunicipalityName, addPostalCode, addProvinceName, businessAddress, documentFiles, onSubmit]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Client"
      description="Create a client profile and optional business details."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="admin-add-client-form" variant="success" disabled={loading}>
            {loading ? "Saving..." : "Create Client"}
          </Button>
        </>
      }
    >
      <form id="admin-add-client-form" onSubmit={handleSubmit} className="space-y-5">
        {error ? <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
            <input type="text" name="first_name" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Middle Name</label>
            <input type="text" name="middle_name" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
            <input type="text" name="last_name" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input type="email" name="email" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Account Password</label>
            <input
              type="password"
              name="user_password"
              defaultValue=""
              onChange={handlePasswordChange}
              maxLength={securitySettings.maxPasswordLength}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="sm:col-span-2">
            <PasswordRequirementsPanel
              password={passwordPreview}
              maxPasswordLength={securitySettings.maxPasswordLength}
              active={Boolean(passwordPreview)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
            <input type="text" name="phone" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Birthday</label>
            <input type="date" name="date_of_birth" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Civil Status</label>
            <select
              name="civil_status_type_id"
              defaultValue=""
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Select civil status</option>
              {civilStatusTypes.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">TIN No.</label>
            <input type="text" name="tin_no" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
          </div>
          <div className="sm:col-span-2">
            <div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800">Address Details</h4>
                <p className="mt-1 text-xs text-slate-500">Select from the dropdowns to prevent typing errors.</p>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Street Address / House No.</label>
                  <input
                    type="text"
                    name="street_address"
                    defaultValue=""
                    placeholder="House no., street, subdivision"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                  />
                </div>
                <AddressFields
                  provinceValue={addAddress.province}
                  cityValue={addAddress.city}
                  barangayValue={addAddress.barangay}
                  provinces={provinceOptions}
                  cities={cityOptions}
                  barangays={barangayOptions}
                  onProvinceChange={handleAddProvinceChange}
                  onCityChange={handleAddCityChange}
                  onBarangayChange={handleAddBarangayChange}
                  cityDisabled={isAddCityDisabled}
                  barangayDisabled={isAddBarangayDisabled}
                />
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Postal Code / ZIP Code</label>
                  <input
                    type="text"
                    value={addPostalCode}
                    readOnly
                    className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                  />
                  <p className="mt-2 text-xs text-slate-500">{addPostalHelperText}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
                  <input
                    type="text"
                    value={addAddress.country}
                    readOnly
                    className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                  />
                  <p className="mt-2 text-xs text-slate-500">Currently limited to Philippine addresses.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4" />

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Business Details</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trade Name</label>
              <input type="text" name="trade_name" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Type of Business</label>
              <select
                name="business_type_id"
                defaultValue=""
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Select type of business</option>
                {businessTypes.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Business Email</label>
              <input type="email" name="email_address" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Business TIN</label>
              <input type="text" name="tin_number" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Contact Number</label>
              <input type="text" name="contact_number" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div className="sm:col-span-2">
              <BusinessAddressMapSelector
                value={businessAddress}
                onChange={setBusinessAddress}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4" />

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">Required Documents</h4>
          {canUploadRequiredDocuments ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {documentTypes.map((document) => (
                <div
                  key={document.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                >
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {formatDocumentTypeLabel(document.name)}
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={(event) => handleDocumentFileChange(document.id, event.target.files?.[0] || null)}
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-emerald-700"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    {documentFiles[document.id]?.name || "No file selected"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You do not have permission to upload files in Required Documents.
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function ClientManagement({
  clientStatusFilter = "active",
  pageTitle = "Client Management",
  pageDescription = "Manage active client profiles and business information from the admin dashboard.",
  emptyMessage = "No active clients found.",
  showAddClientButton = true,
}) {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [clients, setClients] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [civilStatusTypes, setCivilStatusTypes] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [documentFiles, setDocumentFiles] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  const [viewClient, setViewClient] = useState(null);
  const [viewBusiness, setViewBusiness] = useState(null);
  const [viewDocuments, setViewDocuments] = useState([]);
  const [locationClientName, setLocationClientName] = useState("");
  const [locationBusiness, setLocationBusiness] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  useErrorToast(error);
  useErrorToast(locationError);
  const [editDocuments, setEditDocuments] = useState([]);
  const [form, setForm] = useState(createEmptyForm);
  const [editingClient, setEditingClient] = useState(null);
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [statusActionClientId, setStatusActionClientId] = useState(null);
  const locationRequestIdRef = useRef(0);

  const canViewClientManagement = hasFeatureActionAccess(user, "client-management", "view", permissions);
  const canEditClientManagement = hasFeatureActionAccess(user, "client-management", "edit", permissions);
  const canSetClientAccountStatus = hasFeatureActionAccess(user, "client-management", "account-status", permissions);
  const canAddNewClient = hasFeatureActionAccess(user, "client-management", "add-new-client", permissions);
  const canViewClientLocation = hasFeatureActionAccess(user, "client-management", "location", permissions);
  const canUploadRequiredDocuments = hasFeatureActionAccess(user, "client-management", "file-upload", permissions);

  const promptClientManagementAccess = useCallback(async () => {
    if (requestingAccess) {
      return;
    }

    setRequestingAccess(true);
    try {
      const result = await Swal.fire({
        icon: "question",
        title: "Request access?",
        text: "This action is disabled for your role. Do you want to request access to Client Management?",
        showCancelButton: true,
        confirmButtonText: "Request Access",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#2563eb",
        cancelButtonColor: "#64748b",
        reverseButtons: true,
      });

      if (!result.isConfirmed) {
        return;
      }

      const response = await requestModuleAccess("client-management", "Client Management");
      if (response?.data?.success === false) {
        throw new Error(response?.data?.message || "Unable to send access request.");
      }

      showSuccessToast({
        title: response?.data?.message || "Access request sent to Admin.",
        duration: 2200,
      });
    } catch (requestError) {
      showErrorToast({
        title: requestError?.response?.data?.message || "Unable to send access request.",
        duration: 2400,
      });
    } finally {
      setRequestingAccess(false);
    }
  }, [requestingAccess]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await api.get("client_list.php", { params: CLIENT_LIST_PARAMS });
      if (res?.data?.success && Array.isArray(res.data.clients)) {
        setClients(res.data.clients);
      }
    } catch (_) {
      // keep current state when endpoint is unavailable
    }
  }, []);

  const fetchFormOptions = useCallback(async () => {
    try {
      const res = await api.get("client_form_options.php");
      const businessRows = Array.isArray(res?.data?.business_types) && res.data.business_types.length
        ? res.data.business_types
        : FALLBACK_BUSINESS_TYPES;
      const civilRows = Array.isArray(res?.data?.civil_status_types) && res.data.civil_status_types.length
        ? res.data.civil_status_types
        : FALLBACK_CIVIL_STATUS_TYPES;
      const documentRows = Array.isArray(res?.data?.document_types) && res.data.document_types.length
        ? res.data.document_types
        : FALLBACK_DOCUMENT_TYPES;

      setBusinessTypes(businessRows);
      setCivilStatusTypes(civilRows);
      setDocumentTypes(documentRows);
    } catch (_) {
      setBusinessTypes(FALLBACK_BUSINESS_TYPES);
      setCivilStatusTypes(FALLBACK_CIVIL_STATUS_TYPES);
      setDocumentTypes(FALLBACK_DOCUMENT_TYPES);
    }
  }, []);

  useEffect(() => {
    if (addOpen || editOpen) {
      return undefined;
    }

    void fetchClients();
    const interval = window.setInterval(() => {
      void fetchClients();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [addOpen, editOpen, fetchClients]);

  useEffect(() => {
    fetchFormOptions();
  }, [fetchFormOptions]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadSecuritySettings = async () => {
      try {
        const response = await fetchSecuritySettings({ signal: controller.signal });
        if (!active) return;
        setSecuritySettings(response?.data?.settings || DEFAULT_SECURITY_SETTINGS);
      } catch (_) {
        if (!active) return;
        setSecuritySettings(DEFAULT_SECURITY_SETTINGS);
      }
    };

    loadSecuritySettings();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const resetForm = useCallback(() => {
    setForm(createEmptyForm());
    setDocumentFiles({});
    setEditDocuments([]);
    setEditingClient(null);
    setError("");
    setSuccess("");
  }, []);

  useEffect(() => {
    if (canAddNewClient || !addOpen) {
      return;
    }

    setAddOpen(false);
    setForm(createEmptyForm());
    setDocumentFiles({});
    setEditDocuments([]);
    setEditingClient(null);
    setError("");
    setSuccess("");
  }, [addOpen, canAddNewClient]);

  const closeAddModal = useCallback(() => {
    setAddOpen(false);
    resetForm();
  }, [resetForm]);

  const closeEditModal = useCallback(() => {
    setEditOpen(false);
    resetForm();
  }, [resetForm]);

  const closeViewModal = () => {
    setViewOpen(false);
    setViewClient(null);
    setViewBusiness(null);
    setViewDocuments([]);
  };

  const closeLocationModal = () => {
    locationRequestIdRef.current += 1;
    setLocationOpen(false);
    setLocationClientName("");
    setLocationBusiness(null);
    setLocationLoading(false);
    setLocationError("");
  };

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleBizChange = useCallback((event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, business: { ...prev.business, [name]: value } }));
  }, []);

  const handleBusinessAddressChange = useCallback((nextAddress) => {
    setForm((prev) => ({
      ...prev,
      business: {
        ...prev.business,
        business_street_address: nextAddress.street || "",
        business_barangay: nextAddress.barangay || "",
        business_municipality: nextAddress.city || "",
        business_province: nextAddress.province || "",
        business_postal_code: nextAddress.postalCode || "",
      },
    }));
  }, []);

  const handleDocumentFileChange = useCallback((documentId, file) => {
    setDocumentFiles((prev) => ({
      ...prev,
      [documentId]: file || null,
    }));
  }, []);

  const buildPayload = useCallback(
    (overrides = {}) => buildClientPayload(form, businessTypes, overrides),
    [businessTypes, form]
  );

  const uploadClientDocuments = useCallback(async (clientId, filesByDocumentId = {}) => {
    if (!canUploadRequiredDocuments) {
      return { uploaded: [], failed: [] };
    }

    const uploads = documentTypes
      .map((document) => ({
        documentTypeId: document.id,
        label: formatDocumentTypeLabel(document.name),
        file: filesByDocumentId[document.id] || null,
      }))
      .filter((entry) => entry.file);

    if (!uploads.length) {
      return { uploaded: [], failed: [] };
    }

    const uploaded = [];
    const failed = [];

    for (const entry of uploads) {
      const formData = new FormData();
      formData.append("client_id", String(clientId));
      formData.append("document_type_id", String(entry.documentTypeId));
      formData.append("file", entry.file);

      try {
        const res = await api.post("client_upload_document.php", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (res?.data?.success) {
          uploaded.push(entry.label);
        } else {
          failed.push(`${entry.label}: ${res?.data?.message || "Upload failed."}`);
        }
      } catch (err) {
        failed.push(`${entry.label}: ${err?.response?.data?.message || err?.message || "Upload failed."}`);
      }
    }

    return { uploaded, failed };
  }, [canUploadRequiredDocuments, documentTypes]);

  const onOpenAdd = useCallback(() => {
    if (!canAddNewClient) {
      return;
    }

    setError("");
    setSuccess("");
    if (!businessTypes.length || !civilStatusTypes.length || !documentTypes.length) {
      fetchFormOptions();
    }
    setAddOpen(true);
  }, [
    businessTypes.length,
    canAddNewClient,
    civilStatusTypes.length,
    documentTypes.length,
    fetchFormOptions,
  ]);

  const onOpenEdit = useCallback(async (client) => {
    if (!canEditClientManagement) {
      return;
    }

    setError("");
    setSuccess("");
    setEditingClient(client);
    setDocumentFiles({});
    setEditDocuments([]);
    if (!businessTypes.length || !civilStatusTypes.length || !documentTypes.length) {
      fetchFormOptions();
    }

    let business = null;
    try {
      const [businessRes, documentsRes] = await Promise.all([
        api.get("client_business.php", { params: { client_id: client.id } }).catch(() => null),
        api.get("client_documents.php", { params: { client_id: client.id } }).catch(() => null),
      ]);

      if (businessRes?.data?.success) business = businessRes.data.business || null;
      if (documentsRes?.data?.success && Array.isArray(documentsRes.data.documents)) {
        setEditDocuments(documentsRes.data.documents);
      }
    } catch (_) {}

    setForm({
      first_name: normalizePersonName(client.first_name),
      middle_name: normalizeMiddleName(client.middle_name),
      last_name: normalizePersonName(client.last_name),
      email: client.email || "",
      phone: client.phone || "",
      date_of_birth: client.date_of_birth || "",
      civil_status_type_id: client.civil_status_type_id ? String(client.civil_status_type_id) : "",
      province: client.province || "",
      municipality: client.municipality || "",
      postal_code: client.postal_code || "",
      barangay: client.barangay || "",
      street_address: client.street_address || client.address || "",
      tin_no: client.tin_no || "",
      status_id: String(client.status_id || "1"),
      user_password: "",
      business: {
        trade_name: business?.business_trade_name || business?.business_brand || "",
        business_name: business?.business_type || "",
        business_type_id: business?.business_type_id ? String(business.business_type_id) : "",
        business_province: business?.business_province || "",
        business_municipality: business?.business_municipality || "",
        business_postal_code: business?.business_postal_code || "",
        business_barangay: business?.business_barangay || "",
        business_street_address: business?.business_street_address || business?.business_address || "",
        email_address: business?.business_email || "",
        tin_number: business?.business_tin || "",
        contact_number: business?.business_contact || "",
        type_of_business: business?.business_type || "",
      },
    });

    setEditOpen(true);
  }, [
    businessTypes.length,
    canEditClientManagement,
    civilStatusTypes.length,
    documentTypes.length,
    fetchFormOptions,
  ]);

  const onViewInfo = useCallback(async (client) => {
    if (!canViewClientManagement) {
      return;
    }

    setViewClient(client);
    setViewBusiness(null);
    setViewDocuments([]);
    setViewOpen(true);
    try {
      const [businessRes, documentsRes] = await Promise.all([
        api.get("client_business.php", { params: { client_id: client.id } }).catch(() => null),
        api.get("client_documents.php", { params: { client_id: client.id } }).catch(() => null),
      ]);

      if (businessRes?.data?.success) {
        setViewBusiness(businessRes.data.business || null);
      }
      if (documentsRes?.data?.success && Array.isArray(documentsRes.data.documents)) {
        setViewDocuments(documentsRes.data.documents);
      }
    } catch (_) {}
  }, [canViewClientManagement]);

  const onOpenLocation = useCallback(async (client) => {
    if (!canViewClientLocation) {
      return;
    }

    const requestId = locationRequestIdRef.current + 1;
    locationRequestIdRef.current = requestId;
    setLocationClientName(fullName(client) || getTradeName(client) || "Selected Client");
    setLocationBusiness(null);
    setLocationError("");
    setLocationLoading(true);
    setLocationOpen(true);

    try {
      const businessRes = await api.get("client_business.php", {
        params: { client_id: client.id },
      });
      const nextBusiness = businessRes?.data?.success ? businessRes.data.business || null : null;
      if (locationRequestIdRef.current !== requestId) {
        return;
      }

      if (!nextBusiness) {
        setLocationError("No business location is saved for this client yet.");
        return;
      }

      setLocationBusiness(nextBusiness);
    } catch (locationLoadError) {
      if (locationRequestIdRef.current !== requestId) {
        return;
      }
      setLocationError(
        locationLoadError?.response?.data?.message ||
          locationLoadError?.message ||
          "Failed to load this client's business location."
      );
    } finally {
      if (locationRequestIdRef.current === requestId) {
        setLocationLoading(false);
      }
    }
  }, [canViewClientLocation]);

  const locationBusinessName = useMemo(() => {
    return getTradeName(locationBusiness) || locationClientName || "Selected Client";
  }, [locationBusiness, locationClientName]);

  const viewDocumentMap = useMemo(() => {
    const map = new Map();
    viewDocuments.forEach((document) => {
      const key = String(document?.document_type_id || "");
      if (!key || map.has(key)) return;
      map.set(key, document);
    });
    return map;
  }, [viewDocuments]);

  const editDocumentMap = useMemo(() => {
    const map = new Map();
    editDocuments.forEach((document) => {
      const key = String(document?.document_type_id || "");
      if (!key || map.has(key)) return;
      map.set(key, document);
    });
    return map;
  }, [editDocuments]);

  const toClientDocumentUrl = (path) => {
    const normalized = String(path || "").trim().replace(/^\/+/, "");
    if (!normalized) return "";
    const base = String(api.defaults.baseURL || "").replace(/api\/?$/, "");
    return `${base}${normalized}`;
  };

  const handleCreate = useCallback(async ({ values, address, documentFiles: addDocumentFiles }) => {
    if (!canAddNewClient) {
      setError("You do not have permission to add a new client.");
      return;
    }

    setError("");
    setSuccess("");

    if (!values.first_name || !values.last_name) {
      setError("First and last name are required.");
      return;
    }

    const email = normalizeEmail(values.email);
    if (email && clients.some((client) => normalizeEmail(client?.email) === email)) {
      showErrorToast("Client email already exists.");
      return;
    }

    const tin = normalizeTin(values.tin_no);
    if (tin && clients.some((client) => normalizeTin(client?.tin_no) === tin)) {
      setError("Client TIN already exists.");
      return;
    }

    if (email && !values.user_password) {
      setError("Account password is required when email is provided.");
      return;
    }

    if (!email && values.user_password) {
      setError("Email is required when setting an account password.");
      return;
    }

    if (values.user_password) {
      const passwordValidationError = validatePasswordValue(values.user_password, {
        maxPasswordLength: securitySettings.maxPasswordLength,
      });
      if (passwordValidationError) {
        setError(passwordValidationError);
        return;
      }
    }

    const businessTypeId = normalizeIdValue(values.business?.business_type_id);
    const hasSelectedBusinessType = businessTypes.some((option) => String(option.id) === String(businessTypeId ?? ""));
    const includesBusinessDetails = hasBusinessDetails(values.business);
    if (includesBusinessDetails && !hasSelectedBusinessType) {
      setError("Select a valid type of business.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        ...buildClientPayload(values, businessTypes, {
          province: address?.province,
          municipality: address?.municipality,
          postalCode: address?.postalCode,
          barangay: address?.barangay,
          includeBusinessDetails: includesBusinessDetails,
        }),
        registration_source: "admin",
        approval_status: "Approved",
      };
      const res = await api.post("client_create.php", payload);

      if (res?.data?.success) {
        const createdClientId = normalizeIdValue(res?.data?.client?.id);
        let uploadSummary = { uploaded: [], failed: [] };
        if (createdClientId) {
          uploadSummary = await uploadClientDocuments(createdClientId, addDocumentFiles);
        }

        setAddOpen(false);
        await fetchClients();

        if (uploadSummary.failed.length) {
          showErrorToast(`Client created, but some documents failed to upload: ${uploadSummary.failed.join(" | ")}`);
        }

        const successMessage = res?.data?.message || "Client created successfully.";
        if (uploadSummary.uploaded.length) {
          showSuccessToast(`${successMessage} Uploaded: ${uploadSummary.uploaded.join(", ")}`);
        } else {
          showSuccessToast(successMessage);
        }
      } else {
        setError(res?.data?.message || "Failed to create client.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  }, [
    businessTypes,
    canAddNewClient,
    clients,
    fetchClients,
    securitySettings.maxPasswordLength,
    uploadClientDocuments,
  ]);

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!editingClient?.id) return;
    if (!canEditClientManagement) {
      setError("You do not have permission to edit client records.");
      return;
    }

    setError("");
    setSuccess("");

    if (!form.first_name || !form.last_name) {
      setError("First and last name are required.");
      return;
    }

    const email = normalizeEmail(form.email);
    if (email && clients.some((client) => client.id !== editingClient.id && normalizeEmail(client?.email) === email)) {
      showErrorToast("Client email already exists.");
      return;
    }

    const tin = normalizeTin(form.tin_no);
    if (tin && clients.some((client) => client.id !== editingClient.id && normalizeTin(client?.tin_no) === tin)) {
      setError("Client TIN already exists.");
      return;
    }

    const businessTypeId = normalizeIdValue(form.business?.business_type_id);
    const hasSelectedBusinessType = businessTypes.some((option) => String(option.id) === String(businessTypeId ?? ""));
    if (hasBusinessDetails(form.business) && !hasSelectedBusinessType) {
      setError("Select a valid type of business.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        action: "update",
        client_id: editingClient.id,
        ...buildPayload(),
      };

      const res = await api.post("client_create.php", payload);
      if (res?.data?.success) {
        const updatedClientId = normalizeIdValue(editingClient.id);
        const updatedStatusId = normalizeIdValue(form.status_id) || 1;
        const movedToAnotherPage = !matchesClientStatusFilter(
          { status_id: updatedStatusId, status: updatedStatusId === 1 ? "Active" : "Inactive" },
          clientStatusFilter
        );
        const successMessage = movedToAnotherPage
          ? `Client updated successfully and moved to ${getClientStatusPageLabel(updatedStatusId)}.`
          : "Client updated successfully.";
        let uploadSummary = { uploaded: [], failed: [] };
        if (updatedClientId) {
          uploadSummary = await uploadClientDocuments(updatedClientId, documentFiles);
        }

        setEditOpen(false);
        resetForm();
        await fetchClients();

        if (uploadSummary.failed.length) {
          setError(`Client updated, but some documents failed to upload: ${uploadSummary.failed.join(" | ")}`);
        }

        if (uploadSummary.uploaded.length) {
          setSuccess(`${successMessage} Uploaded: ${uploadSummary.uploaded.join(", ")}`);
        } else {
          setSuccess(successMessage);
        }
      } else {
        setError(res?.data?.message || "Failed to update client.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const toggleClientStatus = useCallback(async (client) => {
    if (!client?.id) return;
    if (!canSetClientAccountStatus) {
      setError("You do not have permission to change client account status.");
      return;
    }

    setError("");
    setSuccess("");

    const currentId = Number(client.status_id);
    const nextId = currentId === 1 ? 2 : 1;
    const nextStatusLabel = nextId === 1 ? "Active" : "Inactive";

    if (nextStatusLabel === "Inactive") {
      const confirmation = await showDangerConfirmDialog({
        title: "Set client account to inactive?",
        text: "This client will no longer be able to log in or use forgot password until the account is reactivated.",
        confirmButtonText: "Set Inactive",
      });
      if (!confirmation.isConfirmed) {
        return;
      }
    } else {
      const confirmation = await showConfirmDialog({
        title: "Set client account to active?",
        text: "This client will be able to log in and use forgot password again.",
        confirmButtonText: "Set Active",
      });
      if (!confirmation.isConfirmed) {
        return;
      }
    }

    setStatusActionClientId(client.id);

    setClients((prev) =>
      prev.map((c) =>
        c.id === client.id
          ? {
              ...c,
              status_id: nextId,
              status: nextStatusLabel,
            }
          : c
      )
    );

    try {
      const res = await api.post("client_create.php", {
        action: "update",
        client_id: client.id,
        first_name: normalizePersonName(client.first_name),
        middle_name: normalizeMiddleNameOrNull(client.middle_name),
        last_name: normalizePersonName(client.last_name),
        email: client.email || null,
        phone: client.phone || null,
        date_of_birth: client.date_of_birth || null,
        province: client.province || null,
        municipality: client.municipality || null,
        barangay: client.barangay || null,
        postal_code: client.postal_code || null,
        street_address: client.street_address || client.address || null,
        tin_no: client.tin_no || null,
        status_id: nextId,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Failed to update status");
      }

      const updated = res?.data?.client;
      if (updated?.id) {
        setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      }
      showSuccessToast({
        title: nextStatusLabel === "Active" ? "Client account activated." : "Client account set to inactive.",
        description:
          nextStatusLabel === "Active"
            ? `The client can log in and use forgot password again. This client now appears on the ${getClientStatusPageLabel(nextId)} page.`
            : `The client can no longer log in until the account is reactivated. This client now appears on the ${getClientStatusPageLabel(nextId)} page.`,
      });
    } catch (err) {
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, status_id: currentId, status: client.status } : c))
      );
      setError(err?.response?.data?.message || err?.message || "Failed to update status.");
    } finally {
      setStatusActionClientId(null);
    }
  }, [canSetClientAccountStatus]);

  const statusFilteredClients = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    return list.filter((client) => matchesClientStatusFilter(client, clientStatusFilter));
  }, [clientStatusFilter, clients]);

  const businessTypeOptions = useMemo(() => {
    return buildBusinessTypeOptions(businessTypes, statusFilteredClients);
  }, [businessTypes, statusFilteredClients]);

  const businessAddressValue = useMemo(
    () => ({
      street: form.business.business_street_address,
      barangay: form.business.business_barangay,
      city: form.business.business_municipality,
      province: form.business.business_province,
      postalCode: form.business.business_postal_code,
      country: "Philippines",
    }),
    [
      form.business.business_barangay,
      form.business.business_municipality,
      form.business.business_postal_code,
      form.business.business_province,
      form.business.business_street_address,
    ]
  );

  const rows = useMemo(() => {
    const list = statusFilteredClients;
    const q = String(search || "").trim().toLowerCase();
    const selected = String(businessTypeFilter || "All").trim().toLowerCase();

    return list.filter((client) => {
      const bizRaw = String(client.business_type || client.business?.business_name || "").trim();
      const biz = bizRaw.toLowerCase();
      const tradeName = getTradeName(client).toLowerCase();
      const businessLocation = getBusinessLocation(client).toLowerCase();
      if (selected !== "all" && biz !== selected) return false;

      if (!q) return true;
      const name = fullName(client).toLowerCase();
      const email = String(client.email || "").toLowerCase();
      const phone = String(client.phone || "").toLowerCase();
      const status = String(client.status || "").toLowerCase();
      const tin = String(client.tin_no || "").toLowerCase();
      const address = String(client.address || "").toLowerCase();

      return (
        name.includes(q) ||
        tradeName.includes(q) ||
        biz.includes(q) ||
        businessLocation.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        status.includes(q) ||
        tin.includes(q) ||
        address.includes(q)
      );
    });
  }, [businessTypeFilter, search, statusFilteredClients]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search, businessTypeFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const tableRows = useMemo(
    () =>
      pagedRows.map((client, idx) => ({
        key: client.id ?? `${fullName(client)}-${startIndex + idx}`,
        index: startIndex + idx + 1,
        clientName: fullName(client) || "-",
        tradeName: getTradeName(client) || "-",
        businessType: client.business_type || "-",
        businessLocation: getBusinessLocation(client),
        status: client.status || "-",
        raw: client,
      })),
    [pagedRows, startIndex]
  );

  const columns = useMemo(
    () => [
      { key: "index", header: "#", width: "8%" },
      { key: "clientName", header: "Client Name", width: "16%" },
      { key: "tradeName", header: "Trade Name", width: "15%" },
      { key: "businessType", header: "Type of Business", width: "15%" },
      {
        key: "businessLocation",
        header: "Business Location",
        width: "16%",
        render: (_, row) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (canViewClientLocation) {
                void onOpenLocation(row.raw);
                return;
              }
              void promptClientManagementAccess();
            }}
            aria-disabled={!canViewClientLocation}
            className={!canViewClientLocation ? "cursor-not-allowed opacity-60" : ""}
            aria-label={`View ${row.clientName} location`}
            title={canViewClientLocation ? "Location" : "Request access"}
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
            Location
          </Button>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "10%",
        render: (value, row) => (
          <button
            type="button"
            onClick={() => {
              if (canSetClientAccountStatus) {
                void toggleClientStatus(row.raw);
                return;
              }
              void promptClientManagementAccess();
            }}
            disabled={canSetClientAccountStatus && statusActionClientId === row.raw?.id}
            aria-disabled={!canSetClientAccountStatus}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusPillClass(
              value
            )} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              canSetClientAccountStatus
                ? statusActionClientId === row.raw?.id
                  ? "cursor-wait opacity-70"
                  : ""
                : "cursor-not-allowed opacity-60"
            }`}
            title={canSetClientAccountStatus ? "Click to change status" : "Request access"}
          >
            {value}
          </button>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        width: "26%",
        render: (_, row) => (
          <div className="flex min-w-max flex-nowrap items-center justify-end gap-1">
            <IconButton
              size="sm"
              variant="secondary"
              className={`shrink-0${!canViewClientManagement ? " cursor-not-allowed opacity-60" : ""}`}
              onClick={() => {
                if (canViewClientManagement) {
                  void onViewInfo(row.raw);
                  return;
                }
                void promptClientManagementAccess();
              }}
              aria-disabled={!canViewClientManagement}
              aria-label={`View ${row.clientName}`}
              title={canViewClientManagement ? "View Info" : "Request access"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              variant="secondary"
              className={`shrink-0${!canEditClientManagement ? " cursor-not-allowed opacity-60" : ""}`}
              onClick={() => {
                if (canEditClientManagement) {
                  void onOpenEdit(row.raw);
                  return;
                }
                void promptClientManagementAccess();
              }}
              aria-disabled={!canEditClientManagement}
              aria-label={`Edit ${row.clientName}`}
              title={canEditClientManagement ? "Edit" : "Request access"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-10.21a1 1 0 0 0 0-1.42l-2.34-2.34a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
              </svg>
            </IconButton>
          </div>
        ),
      },
    ],
    [
      canEditClientManagement,
      canSetClientAccountStatus,
      canViewClientLocation,
      canViewClientManagement,
      onOpenEdit,
      onOpenLocation,
      onViewInfo,
      promptClientManagementAccess,
      statusActionClientId,
      toggleClientStatus,
    ]
  );

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader
          action={
            canAddNewClient && showAddClientButton ? (
              <Button
                variant="success"
                size="sm"
                onClick={onOpenAdd}
                title="Add Client"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 6a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 12 6z" />
                </svg>
                Add Client
              </Button>
            ) : null
          }
        >
          <CardTitle>{pageTitle}</CardTitle>
          <CardDescription>{pageDescription}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error ? (
            <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search clients..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="w-full sm:w-64">
              <select
                value={businessTypeFilter}
                onChange={(event) => setBusinessTypeFilter(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
                aria-label="Filter by type of business"
              >
                {businessTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={tableRows}
            keyField="key"
            compact
            striped={false}
            emptyMessage={emptyMessage}
            className="shadow-none"
          />

          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{rows.length === 0 ? 0 : startIndex + 1}</span>-
              <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, rows.length)}</span> of{" "}
              <span className="font-medium">{rows.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canPrev) setCurrentPage((page) => page - 1);
                }}
                disabled={!canPrev}
              >
                Previous
              </Button>
              <div className="text-xs text-slate-600">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (canNext) setCurrentPage((page) => page + 1);
                }}
                disabled={!canNext}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddClientModal
        open={addOpen}
        onClose={closeAddModal}
        onSubmit={handleCreate}
        loading={loading}
        error={error}
        canUploadRequiredDocuments={canUploadRequiredDocuments}
        documentTypes={documentTypes}
        businessTypes={businessTypes}
        civilStatusTypes={civilStatusTypes}
        securitySettings={securitySettings}
      />

      <Modal
        open={editOpen}
        onClose={closeEditModal}
        title="Edit Client"
        description="Update client and business details."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button type="submit" form="admin-edit-client-form" variant="success" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      >
        <form id="admin-edit-client-form" onSubmit={handleUpdate} className="space-y-5">
          {error ? <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
              <input type="text" name="first_name" value={form.first_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Middle Name</label>
              <input type="text" name="middle_name" value={form.middle_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
              <input type="text" name="last_name" value={form.last_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <input type="text" name="phone" value={form.phone} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Civil Status</label>
              <select
                name="civil_status_type_id"
                value={form.civil_status_type_id}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="">Select civil status</option>
                {civilStatusTypes.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">Street Address</label>
              <input type="text" name="street_address" value={form.street_address} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Barangay</label>
              <input type="text" name="barangay" value={form.barangay} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Municipality / City</label>
              <input type="text" name="municipality" value={form.municipality} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Province</label>
              <input type="text" name="province" value={form.province} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Postal Code</label>
              <input type="text" name="postal_code" value={form.postal_code} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">TIN No.</label>
              <input type="text" name="tin_no" value={form.tin_no} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select name="status_id" value={form.status_id} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30">
                <option value="1">Active</option>
                <option value="2">Inactive</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Business Details (optional)</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Trade Name</label>
                <input type="text" name="trade_name" value={form.business.trade_name} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type of Business</label>
                <select
                  name="business_type_id"
                  value={form.business.business_type_id}
                  onChange={handleBizChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="">Select type of business</option>
                  {businessTypes.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                    {option.name}
                  </option>
                ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Business Email</label>
                <input type="email" name="email_address" value={form.business.email_address} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Business TIN</label>
                <input type="text" name="tin_number" value={form.business.tin_number} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contact Number</label>
                <input type="text" name="contact_number" value={form.business.contact_number} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="sm:col-span-2">
                <BusinessAddressMapSelector
                  value={businessAddressValue}
                  onChange={handleBusinessAddressChange}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Required Documents</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {documentTypes.map((documentType) => {
                const currentDocument = editDocumentMap.get(String(documentType.id));
                const currentDocumentUrl = toClientDocumentUrl(currentDocument?.filepath);

                return (
                  <div
                    key={documentType.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                  >
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {formatDocumentTypeLabel(documentType.name)}
                    </label>
                    {currentDocument && currentDocumentUrl ? (
                      <a
                        href={currentDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 block break-all text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                        title={currentDocument.filename || formatDocumentTypeLabel(documentType.name)}
                      >
                        Current: {currentDocument.filename || formatDocumentTypeLabel(documentType.name)}
                      </a>
                    ) : (
                      <div className="mb-2 text-xs font-medium text-slate-500">Current: Not uploaded</div>
                    )}
                    {canUploadRequiredDocuments ? (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp"
                          onChange={(event) => handleDocumentFileChange(documentType.id, event.target.files?.[0] || null)}
                          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700"
                        />
                        <div className="mt-2 text-xs text-slate-500">
                          {documentFiles[documentType.id]?.name || "No new file selected"}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-xs text-amber-700">
                        Upload permission is disabled.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={viewOpen}
        onClose={closeViewModal}
        title="Client Information"
        description="Client profile and business details."
        size="lg"
        footer={
          <Button variant="secondary" onClick={closeViewModal}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-500">Full Name</div>
            <div className="text-lg font-semibold text-slate-900">{fullName(viewClient) || "-"}</div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">First Name</div>
              <div className="font-medium text-slate-800">{normalizePersonName(viewClient?.first_name) || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Middle Name</div>
              <div className="font-medium text-slate-800">{normalizeMiddleName(viewClient?.middle_name) || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Last Name</div>
              <div className="font-medium text-slate-800">{normalizePersonName(viewClient?.last_name) || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Email</div>
              <div className="break-words font-medium text-slate-800">{viewClient?.email || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Phone</div>
              <div className="font-medium text-slate-800">{viewClient?.phone || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Date of Birth</div>
              <div className="font-medium text-slate-800">{viewClient?.date_of_birth || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Civil Status</div>
              <div className="font-medium text-slate-800">{viewClient?.civil_status_type || "-"}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500">Address</div>
              <div className="break-words font-medium text-slate-800">{viewClient?.address || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">TIN No.</div>
              <div className="font-medium text-slate-800">{viewClient?.tin_no || "-"}</div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Business Details</h4>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Trade Name</div>
                <div className="font-medium text-slate-800">{viewBusiness?.business_trade_name || viewBusiness?.business_brand || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Business Type</div>
                <div className="font-medium text-slate-800">{viewBusiness?.business_type || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Business Address</div>
                <div className="break-words font-medium text-slate-800">{viewBusiness?.business_address || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Business Email</div>
                <div className="break-words font-medium text-slate-800">{viewBusiness?.business_email || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Business TIN</div>
                <div className="font-medium text-slate-800">{viewBusiness?.business_tin || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Contact Number</div>
                <div className="font-medium text-slate-800">{viewBusiness?.business_contact || "-"}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3" />

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Required Documents</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {documentTypes.map((documentType) => {
                const uploadedDocument = viewDocumentMap.get(String(documentType.id));
                const documentUrl = toClientDocumentUrl(uploadedDocument?.filepath);

                return (
                  <div
                    key={documentType.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
                  >
                    <div className="mb-1 text-xs font-medium text-slate-600">
                      {formatDocumentTypeLabel(documentType.name)}
                    </div>
                    {uploadedDocument && documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block break-all font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                        title={uploadedDocument.filename || formatDocumentTypeLabel(documentType.name)}
                      >
                        {uploadedDocument.filename || formatDocumentTypeLabel(documentType.name)}
                      </a>
                    ) : (
                      <div className="font-medium text-slate-500">Not uploaded</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      <BusinessLocationModal
        open={locationOpen}
        onClose={closeLocationModal}
        business={locationBusiness}
        businessName={locationBusinessName}
        loading={locationLoading}
        error={locationError}
        description={`Map location for ${locationBusinessName}.`}
        loadingMessage={`Loading ${locationBusinessName}'s business address...`}
        emptyMessage="No business details are available for this client yet."
      />
    </div>
  );
}

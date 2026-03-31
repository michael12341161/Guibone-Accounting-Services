import React, { useEffect, useMemo, useRef, useState } from "react";
import { LogIn, MapPin } from "lucide-react";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import PasswordRequirementsPanel from "../../components/auth/PasswordRequirementsPanel";
import AddressFields from "../../components/SignUpForm/AddressFields";
import BusinessLocationModal from "../../components/business/BusinessLocationModal";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import {
  resolveBarangayCodeByName,
  resolveCityCodeByName,
  resolveProvinceCodeByName,
  useAddress,
} from "../../hooks/useAddress";
import {
  api,
  DEFAULT_SECURITY_SETTINGS,
  fetchSecuritySettings,
  requestModuleAccess,
  switchToClientAccount,
} from "../../services/api";
import { buildBusinessAddress } from "../../utils/business_location";
import { validatePasswordValue } from "../../utils/passwordValidation";
import {
  joinPersonName,
  normalizeMiddleName,
  normalizeMiddleNameOrNull,
  normalizePersonName,
} from "../../utils/person_name";
import { hasFeatureActionAccess, hasModuleAccess } from "../../utils/module_permissions";

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

function createEmptyAddressSelection() {
  return {
    province: "",
    city: "",
    barangay: "",
    postalCode: "",
    country: "Philippines",
  };
}

function hasAddressSelection(address, postalCode = "") {
  return [address?.province, address?.city, address?.barangay, postalCode].some(
    (value) => String(value ?? "").trim() !== ""
  );
}

function getStatusPillClass(status) {
  const statusText = String(status || "-").toLowerCase();
  if (statusText === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (statusText === "-") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function createAddressSelectionFromRecord({ province, municipality, barangay }) {
  const provinceCode = resolveProvinceCodeByName(province);
  const cityCode = resolveCityCodeByName({
    provinceCode,
    name: municipality,
  });
  const barangayCode = resolveBarangayCodeByName({
    cityCode,
    name: barangay,
  });

  return {
    ...createEmptyAddressSelection(),
    province: provinceCode,
    city: cityCode,
    barangay: barangayCode,
  };
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

export default function ClientManagementSecretary() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const { permissions } = useModulePermissions();
  const [clients, setClients] = useState([]);
  const [businessTypes, setBusinessTypes] = useState(FALLBACK_BUSINESS_TYPES);
  const [civilStatusTypes, setCivilStatusTypes] = useState(FALLBACK_CIVIL_STATUS_TYPES);
  const [documentTypes, setDocumentTypes] = useState(FALLBACK_DOCUMENT_TYPES);
  const [documentFiles, setDocumentFiles] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState(createEmptyForm);
  const [addressSelection, setAddressSelection] = useState(createEmptyAddressSelection);
  const [businessAddressSelection, setBusinessAddressSelection] = useState(createEmptyAddressSelection);
  const [editingClient, setEditingClient] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewClient, setViewClient] = useState(null);
  const [viewBusiness, setViewBusiness] = useState(null);
  const [viewDocuments, setViewDocuments] = useState([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationClientName, setLocationClientName] = useState("");
  const [locationBusiness, setLocationBusiness] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [editDocuments, setEditDocuments] = useState([]);
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [switchingClientAccountId, setSwitchingClientAccountId] = useState(null);
  const locationRequestIdRef = useRef(0);

  const canViewClientManagement = hasFeatureActionAccess(user, "client-management", "view", permissions);
  const canEditClientManagement = hasFeatureActionAccess(user, "client-management", "edit", permissions);
  const canAddNewClient = hasFeatureActionAccess(user, "client-management", "add-new-client", permissions);
  const canViewClientLocation = hasFeatureActionAccess(user, "client-management", "location", permissions);
  const canUploadRequiredDocuments = hasFeatureActionAccess(user, "client-management", "file-upload", permissions);
  const canAccessClientAccount = hasModuleAccess(user, "client-account", permissions);
  const {
    provinceOptions,
    cityOptions,
    barangayOptions,
    selectedProvince,
    selectedCity,
    selectedBarangay,
    postalCode,
    handleProvinceChange,
    handleCityChange,
    handleBarangayChange,
    isCityDisabled,
    isBarangayDisabled,
  } = useAddress({
    value: addressSelection,
    onChange: setAddressSelection,
  });
  const selectedProvinceName = useMemo(
    () => selectedProvince?.name || selectedProvince?.province_name || "",
    [selectedProvince]
  );
  const selectedMunicipalityName = useMemo(
    () => selectedCity?.name || selectedCity?.city_name || "",
    [selectedCity]
  );
  const selectedBarangayName = useMemo(
    () => selectedBarangay?.name || selectedBarangay?.brgy_name || "",
    [selectedBarangay]
  );
  const postalHelperText = addressSelection.city
    ? postalCode
      ? "Auto-filled based on the selected province and city."
      : "Postal code unavailable for the selected city."
    : "Auto-filled once a province and city are selected.";
  const {
    provinceOptions: businessProvinceOptions,
    cityOptions: businessCityOptions,
    barangayOptions: businessBarangayOptions,
    selectedProvince: selectedBusinessProvince,
    selectedCity: selectedBusinessCity,
    selectedBarangay: selectedBusinessBarangay,
    postalCode: businessPostalCode,
    handleProvinceChange: handleBusinessProvinceChange,
    handleCityChange: handleBusinessCityChange,
    handleBarangayChange: handleBusinessBarangayChange,
    isCityDisabled: isBusinessCityDisabled,
    isBarangayDisabled: isBusinessBarangayDisabled,
  } = useAddress({
    value: businessAddressSelection,
    onChange: setBusinessAddressSelection,
  });
  const selectedBusinessProvinceName = useMemo(
    () => selectedBusinessProvince?.name || selectedBusinessProvince?.province_name || "",
    [selectedBusinessProvince]
  );
  const selectedBusinessMunicipalityName = useMemo(
    () => selectedBusinessCity?.name || selectedBusinessCity?.city_name || "",
    [selectedBusinessCity]
  );
  const selectedBusinessBarangayName = useMemo(
    () => selectedBusinessBarangay?.name || selectedBusinessBarangay?.brgy_name || "",
    [selectedBusinessBarangay]
  );
  const businessPostalHelperText = businessAddressSelection.city
    ? businessPostalCode
      ? "Auto-filled based on the selected province and city."
      : "Postal code unavailable for the selected city."
    : "Auto-filled once a province and city are selected.";

  const promptClientManagementAccess = async () => {
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

      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: response?.data?.message || "Access request sent to Admin.",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (requestError) {
      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: requestError?.response?.data?.message || "Unable to send access request.",
        showConfirmButton: false,
        timer: 2400,
        timerProgressBar: true,
      });
    } finally {
      setRequestingAccess(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await api.get("client_list.php", { params: CLIENT_LIST_PARAMS });
      if (res?.data?.success && Array.isArray(res.data.clients)) {
        setClients(res.data.clients);
      }
    } catch (_) {
      // keep existing state on transient API failures
    }
  };

  const fetchFormOptions = async () => {
    try {
      const res = await api.get("client_form_options.php");
      setBusinessTypes(
        Array.isArray(res?.data?.business_types) && res.data.business_types.length
          ? res.data.business_types
          : FALLBACK_BUSINESS_TYPES
      );
      setCivilStatusTypes(
        Array.isArray(res?.data?.civil_status_types) && res.data.civil_status_types.length
          ? res.data.civil_status_types
          : FALLBACK_CIVIL_STATUS_TYPES
      );
      setDocumentTypes(
        Array.isArray(res?.data?.document_types) && res.data.document_types.length
          ? res.data.document_types
          : FALLBACK_DOCUMENT_TYPES
      );
    } catch (_) {
      setBusinessTypes(FALLBACK_BUSINESS_TYPES);
      setCivilStatusTypes(FALLBACK_CIVIL_STATUS_TYPES);
      setDocumentTypes(FALLBACK_DOCUMENT_TYPES);
    }
  };

  useEffect(() => {
    let stop = false;

    const run = async () => {
      try {
        const res = await api.get("client_list.php", { params: CLIENT_LIST_PARAMS });
        if (!stop && res?.data?.success && Array.isArray(res.data.clients)) {
          setClients(res.data.clients);
        }
      } catch (_) {
        // keep existing state on transient API failures
      }
    };

    run();
    const interval = setInterval(run, 5000);

    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const res = await api.get("client_form_options.php");
        if (!active) return;

        setBusinessTypes(
          Array.isArray(res?.data?.business_types) && res.data.business_types.length
            ? res.data.business_types
            : FALLBACK_BUSINESS_TYPES
        );
        setCivilStatusTypes(
          Array.isArray(res?.data?.civil_status_types) && res.data.civil_status_types.length
            ? res.data.civil_status_types
            : FALLBACK_CIVIL_STATUS_TYPES
        );
        setDocumentTypes(
          Array.isArray(res?.data?.document_types) && res.data.document_types.length
            ? res.data.document_types
            : FALLBACK_DOCUMENT_TYPES
        );
      } catch (_) {
        if (!active) return;
        setBusinessTypes(FALLBACK_BUSINESS_TYPES);
        setCivilStatusTypes(FALLBACK_CIVIL_STATUS_TYPES);
        setDocumentTypes(FALLBACK_DOCUMENT_TYPES);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, []);

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

  const resetForm = ({ clearMessages = true } = { clearMessages: true }) => {
    setForm(createEmptyForm());
    setAddressSelection(createEmptyAddressSelection());
    setBusinessAddressSelection(createEmptyAddressSelection());
    setDocumentFiles({});
    setEditDocuments([]);
    setEditingClient(null);
    if (clearMessages) {
      setError("");
      setSuccess("");
    }
  };

  useEffect(() => {
    if (canAddNewClient || !addOpen) {
      return;
    }

    setAddOpen(false);
    setForm(createEmptyForm());
    setAddressSelection(createEmptyAddressSelection());
    setBusinessAddressSelection(createEmptyAddressSelection());
    setDocumentFiles({});
    setEditDocuments([]);
    setEditingClient(null);
    setError("");
    setSuccess("");
  }, [addOpen, canAddNewClient]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleBizChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, business: { ...prev.business, [name]: value } }));
  };

  const handleDocumentFileChange = (documentId, file) => {
    setDocumentFiles((prev) => ({
      ...prev,
      [documentId]: file || null,
    }));
  };

  const closeAddModal = () => {
    setAddOpen(false);
    resetForm();
  };

  const closeEditModal = () => {
    setEditOpen(false);
    resetForm();
  };

  const openAddModal = () => {
    if (!canAddNewClient) {
      return;
    }

    resetForm();
    fetchFormOptions();
    setForm((prev) => ({ ...prev, status_id: "1" }));
    setAddOpen(true);
  };

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

  const buildPayload = (overrides = {}) => {
    const businessTypeId = normalizeIdValue(form.business?.business_type_id);
    const civilStatusTypeId = normalizeIdValue(form.civil_status_type_id);
    const selectedBusinessType = businessTypes.find((option) => String(option.id) === String(businessTypeId ?? ""));
    const includesBusinessDetails = overrides.includeBusinessDetails ?? hasBusinessDetails(form.business);
    const resolveTextValue = (override, fallback) =>
      String(override == null || override === "" ? fallback ?? "" : override).trim();
    const province = resolveTextValue(overrides.province, form.province);
    const municipality = resolveTextValue(overrides.municipality, form.municipality);
    const resolvedPostalCode = resolveTextValue(overrides.postalCode, form.postal_code);
    const barangay = resolveTextValue(overrides.barangay, form.barangay);
    const businessProvince = resolveTextValue(overrides.businessProvince, form.business.business_province);
    const businessMunicipality = resolveTextValue(overrides.businessMunicipality, form.business.business_municipality);
    const resolvedBusinessPostalCode = resolveTextValue(overrides.businessPostalCode, form.business.business_postal_code);
    const businessBarangay = resolveTextValue(overrides.businessBarangay, form.business.business_barangay);

    return {
      first_name: normalizePersonName(form.first_name),
      middle_name: normalizeMiddleNameOrNull(form.middle_name),
      last_name: normalizePersonName(form.last_name),
      email: form.email || null,
      phone: form.phone || null,
      date_of_birth: form.date_of_birth || null,
      civil_status_type_id: civilStatusTypeId,
      province: province || null,
      municipality: municipality || null,
      postal_code: resolvedPostalCode || null,
      barangay: barangay || null,
      street_address: form.street_address || null,
      tin_no: form.tin_no || null,
      status_id: normalizeIdValue(form.status_id) || 1,
      user_password: form.user_password || null,
      business_details:
        includesBusinessDetails
          ? {
              trade_name: form.business.trade_name || form.business.business_name || "",
              business_type_id: businessTypeId,
              type_of_business: selectedBusinessType?.name || "",
              street_address: form.business.business_street_address || "",
              barangay: businessBarangay || null,
              municipality: businessMunicipality || null,
              province: businessProvince || null,
              postal_code: resolvedBusinessPostalCode || null,
              email_address: form.business.email_address || null,
              tin_number: form.business.tin_number || null,
              contact_number: form.business.contact_number || null,
            }
          : undefined,
    };
  };

  const uploadClientDocuments = async (clientId) => {
    if (!canUploadRequiredDocuments) {
      return { uploaded: [], failed: [] };
    }

    const uploads = documentTypes
      .map((document) => ({
        documentTypeId: document.id,
        label: formatDocumentTypeLabel(document.name),
        file: documentFiles[document.id] || null,
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
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!canAddNewClient) {
      setError("You do not have permission to add a new client.");
      return;
    }

    setError("");
    setSuccess("");

    if (!form.first_name || !form.last_name) {
      setError("First and last name are required.");
      return;
    }

    const email = normalizeEmail(form.email);
    if (email && clients.some((client) => normalizeEmail(client?.email) === email)) {
      setError("Client email already exists.");
      return;
    }

    const tin = normalizeTin(form.tin_no);
    if (tin && clients.some((client) => normalizeTin(client?.tin_no) === tin)) {
      setError("Client TIN already exists.");
      return;
    }

    if (email && !form.user_password) {
      setError("Account password is required when email is provided.");
      return;
    }

    if (!email && form.user_password) {
      setError("Email is required when setting an account password.");
      return;
    }

    if (form.user_password) {
      const passwordValidationError = validatePasswordValue(form.user_password, {
        maxPasswordLength: securitySettings.maxPasswordLength,
      });
      if (passwordValidationError) {
        setError(passwordValidationError);
        return;
      }
    }

    const businessTypeId = normalizeIdValue(form.business?.business_type_id);
    const hasSelectedBusinessType = businessTypes.some((option) => String(option.id) === String(businessTypeId ?? ""));
    const includesBusinessDetails =
      hasBusinessDetails(form.business) || hasAddressSelection(businessAddressSelection, businessPostalCode);
    if (includesBusinessDetails && !hasSelectedBusinessType) {
      setError("Select a valid type of business.");
      return;
    }

    try {
      setLoading(true);
      const payload = buildPayload({
        province: selectedProvinceName || undefined,
        municipality: selectedMunicipalityName || undefined,
        postalCode: postalCode || undefined,
        barangay: selectedBarangayName || undefined,
        businessProvince: selectedBusinessProvinceName || undefined,
        businessMunicipality: selectedBusinessMunicipalityName || undefined,
        businessPostalCode: businessPostalCode || undefined,
        businessBarangay: selectedBusinessBarangayName || undefined,
        includeBusinessDetails: includesBusinessDetails,
      });
      const res = await api.post("client_create.php", payload);

      if (res?.data?.success) {
        const createdClientId = normalizeIdValue(res?.data?.client?.id);
        let uploadSummary = { uploaded: [], failed: [] };
        if (createdClientId) {
          uploadSummary = await uploadClientDocuments(createdClientId);
        }

        setAddOpen(false);
        resetForm();
        await fetchClients();

        if (uploadSummary.failed.length) {
          setError(`Client created, but some documents failed to upload: ${uploadSummary.failed.join(" | ")}`);
        }

        if (uploadSummary.uploaded.length) {
          setSuccess(`Client created successfully. Uploaded: ${uploadSummary.uploaded.join(", ")}`);
        } else {
          setSuccess("Client created successfully.");
        }
      } else {
        setError(res?.data?.message || "Failed to create client.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const onOpenEdit = async (client) => {
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
    } catch (_) {
      // keep modal usable even if auxiliary lookups fail
    }

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
    setAddressSelection(
      createAddressSelectionFromRecord({
        province: client.province || "",
        municipality: client.municipality || "",
        barangay: client.barangay || "",
      })
    );
    setBusinessAddressSelection(
      createAddressSelectionFromRecord({
        province: business?.business_province || "",
        municipality: business?.business_municipality || "",
        barangay: business?.business_barangay || "",
      })
    );

    setEditOpen(true);
  };

  const onViewInfo = async (client) => {
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
    } catch (_) {
      // keep modal open even if business lookup fails
    }
  };

  const onOpenLocation = async (client) => {
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
  };

  const openClientAccount = async (client) => {
    const clientId = Number(client?.id ?? 0);
    const hasClientUserAccount = Number(client?.user_id ?? 0) > 0 && Number(client?.role_id ?? 0) === 4;
    if (!canAccessClientAccount || clientId <= 0 || !hasClientUserAccount) {
      return;
    }

    const clientLabel = fullName(client) || "this client";
    const result = await Swal.fire({
      icon: "question",
      title: "Access client account?",
      text: `Are you sure you want to access ${clientLabel}'s account?`,
      showCancelButton: true,
      confirmButtonText: "Access Account",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      setSwitchingClientAccountId(clientId);
      const response = await switchToClientAccount(clientId);
      const nextUser = response?.data?.user;
      if (!nextUser) {
        throw new Error(response?.data?.message || "Unable to open the client account.");
      }

      login(nextUser);
      navigate("/client", { replace: true });
    } catch (err) {
      void Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: err?.response?.data?.message || err?.message || "Unable to access the client account.",
        showConfirmButton: false,
        timer: 2400,
        timerProgressBar: true,
      });
    } finally {
      setSwitchingClientAccountId(null);
    }
  };

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
      setError("Client email already exists.");
      return;
    }

    const tin = normalizeTin(form.tin_no);
    if (tin && clients.some((client) => client.id !== editingClient.id && normalizeTin(client?.tin_no) === tin)) {
      setError("Client TIN already exists.");
      return;
    }

    const businessTypeId = normalizeIdValue(form.business?.business_type_id);
    const hasSelectedBusinessType = businessTypes.some((option) => String(option.id) === String(businessTypeId ?? ""));
    const includesBusinessDetails =
      hasBusinessDetails(form.business) || hasAddressSelection(businessAddressSelection, businessPostalCode);
    if (includesBusinessDetails && !hasSelectedBusinessType) {
      setError("Select a valid type of business.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        action: "update",
        client_id: editingClient.id,
        ...buildPayload({
          province: selectedProvinceName || undefined,
          municipality: selectedMunicipalityName || undefined,
          postalCode: postalCode || undefined,
          barangay: selectedBarangayName || undefined,
          businessProvince: selectedBusinessProvinceName || undefined,
          businessMunicipality: selectedBusinessMunicipalityName || undefined,
          businessPostalCode: businessPostalCode || undefined,
          businessBarangay: selectedBusinessBarangayName || undefined,
          includeBusinessDetails: includesBusinessDetails,
        }),
      };

      const res = await api.post("client_create.php", payload);
      if (res?.data?.success) {
        const updatedClientId = normalizeIdValue(editingClient.id);
        let uploadSummary = { uploaded: [], failed: [] };
        if (updatedClientId) {
          uploadSummary = await uploadClientDocuments(updatedClientId);
        }

        setEditOpen(false);
        resetForm();
        await fetchClients();

        if (uploadSummary.failed.length) {
          setError(`Client updated, but some documents failed to upload: ${uploadSummary.failed.join(" | ")}`);
        }

        if (uploadSummary.uploaded.length) {
          setSuccess(`Client updated successfully. Uploaded: ${uploadSummary.uploaded.join(", ")}`);
        } else {
          setSuccess("Client updated successfully.");
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

  const toggleClientStatus = async (client) => {
    if (!client?.id) return;
    if (!canEditClientManagement) {
      setError("You do not have permission to edit client records.");
      return;
    }

    setError("");
    setSuccess("");

    const currentId = Number(client.status_id);
    const nextId = currentId === 1 ? 2 : 1;

    setClients((prev) =>
      prev.map((c) =>
        c.id === client.id
          ? {
              ...c,
              status_id: nextId,
              status: nextId === 1 ? "Active" : "Inactive",
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
    } catch (err) {
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, status_id: currentId, status: client.status } : c))
      );
      setError(err?.response?.data?.message || err?.message || "Failed to update status.");
    }
  };

  const businessTypeOptions = useMemo(() => {
    return buildBusinessTypeOptions(businessTypes, clients);
  }, [businessTypes, clients]);

  const filteredClients = useMemo(() => {
    const selected = String(businessTypeFilter || "All").trim().toLowerCase();
    const q = search.trim().toLowerCase();

    return clients.filter((client) => {
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
  }, [clients, businessTypeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [search, businessTypeFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedClients = filteredClients.slice(startIndex, startIndex + PAGE_SIZE);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  const tableRows = useMemo(
    () =>
      pagedClients.map((client, idx) => ({
        key: client.id ?? `${fullName(client)}-${startIndex + idx}`,
        index: startIndex + idx + 1,
        clientName: fullName(client) || "-",
        tradeName: getTradeName(client) || "-",
        businessType: client.business_type || "-",
        businessLocation: getBusinessLocation(client),
        status: client.status || "-",
        raw: client,
      })),
    [pagedClients, startIndex]
  );

  const columns = [
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
            if (canEditClientManagement) {
              void toggleClientStatus(row.raw);
              return;
            }
            void promptClientManagementAccess();
          }}
          aria-disabled={!canEditClientManagement}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusPillClass(
            value
          )} hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
            canEditClientManagement ? "" : "cursor-not-allowed opacity-60"
          }`}
          title={canEditClientManagement ? "Click to toggle status" : "Request access"}
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
          {canAccessClientAccount ? (
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 gap-1 px-2.5"
              onClick={() => {
                void openClientAccount(row.raw);
              }}
              disabled={
                switchingClientAccountId === Number(row.raw?.id ?? 0) ||
                Number(row.raw?.user_id ?? 0) <= 0 ||
                Number(row.raw?.role_id ?? 0) !== 4
              }
              title={
                Number(row.raw?.user_id ?? 0) > 0 && Number(row.raw?.role_id ?? 0) === 4
                  ? "Access client account"
                  : "No linked client account"
              }
            >
              <LogIn className="h-3.5 w-3.5" strokeWidth={1.8} />
              {switchingClientAccountId === Number(row.raw?.id ?? 0) ? "Opening..." : "Account"}
            </Button>
          ) : null}
          <IconButton
            size="sm"
            variant="secondary"
            onClick={() => {
              if (canViewClientManagement) {
                void onViewInfo(row.raw);
                return;
              }
              void promptClientManagementAccess();
            }}
            aria-disabled={!canViewClientManagement}
            className={`shrink-0${!canViewClientManagement ? " cursor-not-allowed opacity-60" : ""}`}
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
            onClick={() => {
              if (canEditClientManagement) {
                void onOpenEdit(row.raw);
                return;
              }
              void promptClientManagementAccess();
            }}
            aria-disabled={!canEditClientManagement}
            className={`shrink-0${!canEditClientManagement ? " cursor-not-allowed opacity-60" : ""}`}
            aria-label={`Edit ${row.clientName}`}
            title={canEditClientManagement ? "Edit" : "Request access"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" />
            </svg>
          </IconButton>
        </div>
      ),
    },
  ];

  const locationBusinessName = useMemo(() => {
    return getTradeName(locationBusiness) || locationClientName || "Selected Client";
  }, [locationBusiness, locationClientName]);

  return (
    <div className="space-y-4">
      <Card compact>
        <CardHeader
          action={
            canAddNewClient ? (
              <Button
                variant="success"
                size="sm"
                onClick={openAddModal}
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
          <CardTitle>Client Management</CardTitle>
          <CardDescription>Manage client records from the secretary dashboard.</CardDescription>
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
                {businessTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
            emptyMessage="No clients found."
            className="shadow-none"
          />

          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{filteredClients.length === 0 ? 0 : startIndex + 1}</span>-
              <span className="font-medium">{Math.min(startIndex + PAGE_SIZE, filteredClients.length)}</span> of{" "}
              <span className="font-medium">{filteredClients.length}</span>
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

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="Add New Client"
        description="Create a client profile and optional business details."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>
              Cancel
            </Button>
            <Button type="submit" form="secretary-add-client-form" variant="success" disabled={loading}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </>
        }
      >
        <form id="secretary-add-client-form" onSubmit={handleCreate} className="space-y-5">
          {error ? <div className="whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
              <input type="text" name="first_name" value={form.first_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., John" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Middle Name</label>
              <input type="text" name="middle_name" value={form.middle_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., A." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
              <input type="text" name="last_name" value={form.last_name} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., Doe" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., john@example.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Account Password</label>
              <input type="password" name="user_password" value={form.user_password} onChange={handleChange} maxLength={securitySettings.maxPasswordLength} autoComplete="new-password" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="Enter initial client password" />
            </div>
            <div className="sm:col-span-2">
              <PasswordRequirementsPanel
                password={form.user_password}
                maxPasswordLength={securitySettings.maxPasswordLength}
                active={Boolean(form.user_password)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <input type="text" name="phone" value={form.phone} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., +63 900 000 0000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Birthday</label>
              <input type="date" name="date_of_birth" value={form.date_of_birth} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Civil Status</label>
              <select
                name="civil_status_type_id"
                value={form.civil_status_type_id}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
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
              <input type="text" name="tin_no" value={form.tin_no} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., 123-456-789" />
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
                      value={form.street_address}
                      onChange={handleChange}
                      placeholder="House no., street, subdivision"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                    />
                  </div>
                  <AddressFields
                    provinceValue={addressSelection.province}
                    cityValue={addressSelection.city}
                    barangayValue={addressSelection.barangay}
                    provinces={provinceOptions}
                    cities={cityOptions}
                    barangays={barangayOptions}
                    onProvinceChange={handleProvinceChange}
                    onCityChange={handleCityChange}
                    onBarangayChange={handleBarangayChange}
                    cityDisabled={isCityDisabled}
                    barangayDisabled={isBarangayDisabled}
                  />
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Postal Code / ZIP Code</label>
                    <input
                      type="text"
                      value={postalCode}
                      readOnly
                      className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                    />
                    <p className="mt-2 text-xs text-slate-500">{postalHelperText}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
                    <input
                      type="text"
                      value={addressSelection.country}
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
                <input type="text" name="trade_name" value={form.business.trade_name} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., ABC Corp" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type of Business</label>
                <select
                  name="business_type_id"
                  value={form.business.business_type_id}
                  onChange={handleBizChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30"
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
                <input type="email" name="email_address" value={form.business.email_address} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., biz@example.com" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Business TIN</label>
                <input type="text" name="tin_number" value={form.business.tin_number} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., 987-654-321" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contact Number</label>
                <input type="text" name="contact_number" value={form.business.contact_number} onChange={handleBizChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/30" placeholder="e.g., +63 900 111 2222" />
              </div>
              <div className="sm:col-span-2">
                <div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Business Address Details</h4>
                    <p className="mt-1 text-xs text-slate-500">Select from the dropdowns to prevent typing errors.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Business Street Address / House No.</label>
                      <input
                        type="text"
                        name="business_street_address"
                        value={form.business.business_street_address}
                        onChange={handleBizChange}
                        placeholder="House no., street, subdivision"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                      />
                    </div>
                    <AddressFields
                      provinceValue={businessAddressSelection.province}
                      cityValue={businessAddressSelection.city}
                      barangayValue={businessAddressSelection.barangay}
                      provinces={businessProvinceOptions}
                      cities={businessCityOptions}
                      barangays={businessBarangayOptions}
                      onProvinceChange={handleBusinessProvinceChange}
                      onCityChange={handleBusinessCityChange}
                      onBarangayChange={handleBusinessBarangayChange}
                      cityDisabled={isBusinessCityDisabled}
                      barangayDisabled={isBusinessBarangayDisabled}
                    />
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Postal Code / ZIP Code</label>
                      <input
                        type="text"
                        value={businessPostalCode}
                        readOnly
                        className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">{businessPostalHelperText}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
                      <input
                        type="text"
                        value={businessAddressSelection.country}
                        readOnly
                        className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">Currently limited to Philippine addresses.</p>
                    </div>
                  </div>
                </div>
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
                Upload permission is disabled for Required Documents.
              </div>
            )}
          </div>
        </form>
      </Modal>

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
            <Button type="submit" form="secretary-edit-client-form" variant="success" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      >
        <form id="secretary-edit-client-form" onSubmit={handleUpdate} className="space-y-5">
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
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">TIN No.</label>
              <input type="text" name="tin_no" value={form.tin_no} onChange={handleChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
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
                      value={form.street_address}
                      onChange={handleChange}
                      placeholder="House no., street, subdivision"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                    />
                  </div>
                  <AddressFields
                    provinceValue={addressSelection.province}
                    cityValue={addressSelection.city}
                    barangayValue={addressSelection.barangay}
                    provinces={provinceOptions}
                    cities={cityOptions}
                    barangays={barangayOptions}
                    onProvinceChange={handleProvinceChange}
                    onCityChange={handleCityChange}
                    onBarangayChange={handleBarangayChange}
                    cityDisabled={isCityDisabled}
                    barangayDisabled={isBarangayDisabled}
                  />
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Postal Code / ZIP Code</label>
                    <input
                      type="text"
                      value={postalCode || form.postal_code}
                      readOnly
                      className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                    />
                    <p className="mt-2 text-xs text-slate-500">{postalHelperText}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
                    <input
                      type="text"
                      value={addressSelection.country}
                      readOnly
                      className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                    />
                    <p className="mt-2 text-xs text-slate-500">Currently limited to Philippine addresses.</p>
                  </div>
                </div>
              </div>
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
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Business Details</h4>
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
                <div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Business Address Details</h4>
                    <p className="mt-1 text-xs text-slate-500">Select from the dropdowns to prevent typing errors.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Business Street Address / House No.</label>
                      <input
                        type="text"
                        name="business_street_address"
                        value={form.business.business_street_address}
                        onChange={handleBizChange}
                        placeholder="House no., street, subdivision"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
                      />
                    </div>
                    <AddressFields
                      provinceValue={businessAddressSelection.province}
                      cityValue={businessAddressSelection.city}
                      barangayValue={businessAddressSelection.barangay}
                      provinces={businessProvinceOptions}
                      cities={businessCityOptions}
                      barangays={businessBarangayOptions}
                      onProvinceChange={handleBusinessProvinceChange}
                      onCityChange={handleBusinessCityChange}
                      onBarangayChange={handleBusinessBarangayChange}
                      cityDisabled={isBusinessCityDisabled}
                      barangayDisabled={isBusinessBarangayDisabled}
                    />
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">Postal Code / ZIP Code</label>
                      <input
                        type="text"
                        value={businessPostalCode || form.business.business_postal_code}
                        readOnly
                        className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">{businessPostalHelperText}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-slate-700">Country</label>
                      <input
                        type="text"
                        value={businessAddressSelection.country}
                        readOnly
                        className="w-full rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-500 shadow-sm outline-none"
                      />
                      <p className="mt-2 text-xs text-slate-500">Currently limited to Philippine addresses.</p>
                    </div>
                  </div>
                </div>
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
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Full Name</div>
              <div className="text-lg font-semibold text-slate-900">{fullName(viewClient) || "-"}</div>
            </div>
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
              <div className="text-xs text-slate-500">Birthday</div>
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

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { appLogo } from "../../assets/branding";
import PasswordRequirementsPanel from "../../components/auth/PasswordRequirementsPanel";
import BusinessAddressMapSelector from "../../components/business/BusinessAddressMapSelector";
import AddressFields from "../../components/SignUpForm/AddressFields";
import InputField from "../../components/UI/InputField";
import { api, DEFAULT_SECURITY_SETTINGS, fetchSecuritySettings } from "../../services/api";
import { useAddress } from "../../hooks/useAddress";
import { validatePasswordValue } from "../../utils/passwordValidation";
import { isValidEmail, isValidPhoneNumber } from "../../utils/helpers";
import { normalizeMiddleNameOrNull, normalizePersonName } from "../../utils/person_name";
import { useTheme } from "../../context/ThemeContext";
import { useErrorToast } from "../../utils/feedback";

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

const REQUIRED_SIGNUP_DOCUMENT_KEYS = new Set([
  "valid_id",
  "validid",
  "birth_certificate",
  "psa_birth_certificate",
  "psa_birthcert",
  "psa_birth_cert",
  "birth_cert",
  "birthcert",
  "birth_certificate_psa",
]);

const DUPLICATE_EMAIL_MESSAGE =
  "This email already has an account. Please use a different email or login instead.";

function createEmptyForm() {
  return {
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    civil_status_type_id: "",
    address: {
      street: "",
      barangay: "",
      city: "",
      province: "",
      postalCode: "",
      country: "Philippines",
    },
    tin_no: "",
    user_password: "",
    confirm_password: "",
    agreement: false,
    business: {
      trade_name: "",
      business_type_id: "",
      business_address: "",
      business_province: "",
      business_city: "",
      business_barangay: "",
      business_postal_code: "",
      business_country: "Philippines",
      email_address: "",
      tin_number: "",
      contact_number: "",
      type_of_business: "",
    },
  };
}

function normalizeIdValue(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasBusinessDetails(business) {
  return [
    business?.trade_name,
    business?.business_address,
    business?.business_barangay,
    business?.business_city,
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

function normalizeDocumentKey(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (raw === "psa_birthcertificate") return "psa_birth_certificate";
  return raw;
}

function isRequiredSignupDocument(documentType) {
  const key = normalizeDocumentKey(documentType?.name);
  if (!key) return false;
  if (REQUIRED_SIGNUP_DOCUMENT_KEYS.has(key)) return true;

  return key.includes("birth") && key.includes("cert");
}

function StatusMessage({ tone, children }) {
  if (!children) return null;

  const styles =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={`whitespace-pre-line rounded-2xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5a10.45 10.45 0 0 0 4.703-1.098M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88" />
    </svg>
  );
}

function SectionPanel({ title, description, children }) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-[0_24px_70px_-55px_rgba(15,23,42,0.55)] backdrop-blur sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:flex">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5">
            <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
          </svg>
        </div>
      </div>
      {children}
    </section>
  );
}

function SelectField({ label, name, value, onChange, options, placeholder, required = false }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DocumentUploadField({ document, selectedFile, onFileChange, required = false }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`document-${document.id}`}>
        {formatDocumentTypeLabel(document.name)}
        {required ? <span className="ml-1 text-rose-500">*</span> : <span className="ml-2 text-xs font-medium text-slate-400">Optional</span>}
      </label>
      <input
        id={`document-${document.id}`}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp"
        onChange={(event) => onFileChange(document.id, event.target.files?.[0] || null)}
        required={required}
        className="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-700"
      />
      <p className="mt-3 text-xs text-slate-500">{selectedFile?.name || "No file selected"}</p>
    </div>
  );
}

function buildPayload(form, businessTypes, addressParts, businessAddressParts) {
  const businessTypeId = normalizeIdValue(form.business.business_type_id);
  const civilStatusTypeId = normalizeIdValue(form.civil_status_type_id);
  const selectedBusinessType = businessTypes.find((option) => String(option.id) === String(businessTypeId ?? ""));
  const includesBusinessDetails = hasBusinessDetails(form.business);
  const provinceName = String(addressParts?.province || "").trim();
  const municipalityName = String(addressParts?.municipality || "").trim();
  const barangayName = String(addressParts?.barangay || "").trim();
  const postalCode = String(addressParts?.postalCode || "").trim();
  const businessProvinceName = String(businessAddressParts?.province || "").trim();
  const businessMunicipalityName = String(businessAddressParts?.municipality || "").trim();
  const businessBarangayName = String(businessAddressParts?.barangay || "").trim();
  const businessPostalCode = String(businessAddressParts?.postalCode || "").trim();

  return {
    first_name: normalizePersonName(form.first_name),
    middle_name: normalizeMiddleNameOrNull(form.middle_name),
    last_name: normalizePersonName(form.last_name),
    email: form.email.trim().toLowerCase(),
    phone: form.phone.trim() || null,
    date_of_birth: form.date_of_birth || null,
    civil_status_type_id: civilStatusTypeId,
    province: provinceName || null,
    municipality: municipalityName || null,
    barangay: barangayName || null,
    postal_code: postalCode || null,
    street_address: form.address.street.trim() || null,
    tin_no: form.tin_no.trim() || null,
    registration_source: "self_signup",
    approval_status: "Pending",
    user_password: form.user_password,
    business_details: includesBusinessDetails
      ? {
          trade_name: form.business.trade_name.trim(),
          business_type_id: businessTypeId,
          type_of_business: selectedBusinessType?.name || "",
          street_address: form.business.business_address.trim(),
          business_address: form.business.business_address.trim(),
          barangay: businessBarangayName || null,
          municipality: businessMunicipalityName || null,
          province: businessProvinceName || null,
          postal_code: businessPostalCode || null,
          email_address: form.business.email_address.trim() || null,
          tin_number: form.business.tin_number.trim() || null,
          contact_number: form.business.contact_number.trim() || null,
        }
      : undefined,
  };
}

export default function SignUpPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [form, setForm] = useState(createEmptyForm);
  const [securitySettings, setSecuritySettings] = useState(DEFAULT_SECURITY_SETTINGS);
  const [businessTypes, setBusinessTypes] = useState(FALLBACK_BUSINESS_TYPES);
  const [civilStatusTypes, setCivilStatusTypes] = useState(FALLBACK_CIVIL_STATUS_TYPES);
  const [documentTypes, setDocumentTypes] = useState(FALLBACK_DOCUMENT_TYPES);
  const [documentFiles, setDocumentFiles] = useState({});
  const [createdClientId, setCreatedClientId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  useErrorToast(error);
  useErrorToast(emailError);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [warning, setWarning] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const signupDocumentTypes = useMemo(
    () => (Array.isArray(documentTypes) ? documentTypes : []),
    [documentTypes]
  );
  const requiredDocumentTypes = useMemo(
    () => signupDocumentTypes.filter(isRequiredSignupDocument),
    [signupDocumentTypes]
  );
  const requiredDocumentIds = useMemo(
    () => requiredDocumentTypes.map((document) => String(document.id)),
    [requiredDocumentTypes]
  );
  const requiredDocumentLabels = useMemo(
    () => requiredDocumentTypes.map((document) => formatDocumentTypeLabel(document.name)),
    [requiredDocumentTypes]
  );
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
    value: form.address,
    onChange: (nextAddress) =>
      setForm((prev) => ({
        ...prev,
        address: nextAddress,
      })),
  });
  const provinceName = useMemo(
    () => selectedProvince?.name || selectedProvince?.province_name || form.address.province || "",
    [form.address.province, selectedProvince]
  );
  const municipalityName = useMemo(
    () => selectedCity?.name || selectedCity?.city_name || form.address.city || "",
    [form.address.city, selectedCity]
  );
  const barangayName = useMemo(
    () => selectedBarangay?.name || selectedBarangay?.brgy_name || form.address.barangay || "",
    [form.address.barangay, selectedBarangay]
  );
  const postalHelperText = form.address.city
    ? postalCode
      ? "Auto-filled based on your selected province and city."
      : "Postal code unavailable for the selected city."
    : "Auto-filled once a province and city are selected.";

  useEffect(() => {
    let active = true;

    const fetchOptions = async () => {
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
        setWarning("Live form options are unavailable right now. Default dropdown and document choices are being used.");
      }
    };

    fetchOptions();

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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    if (name === "email") {
      setEmailError("");
      setError((prev) => (prev === DUPLICATE_EMAIL_MESSAGE ? "" : prev));
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleBusinessChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      business: {
        ...prev.business,
        [name]: value,
      },
    }));
  };

  const handleBusinessLocationChange = (nextAddress) => {
    setForm((prev) => ({
      ...prev,
      business: {
        ...prev.business,
        business_address: nextAddress.street || "",
        business_barangay: nextAddress.barangay || "",
        business_city: nextAddress.city || "",
        business_province: nextAddress.province || "",
        business_postal_code: nextAddress.postalCode || "",
        business_country: nextAddress.country || prev.business.business_country || "Philippines",
      },
    }));
  };

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        [name]: value,
      },
    }));
  };

  const handleDocumentFileChange = (documentId, file) => {
    setDocumentFiles((prev) => ({
      ...prev,
      [String(documentId)]: file || null,
    }));
  };

  const uploadClientDocuments = async (clientId) => {
    const uploads = signupDocumentTypes
      .map((document) => ({
        documentTypeId: document.id,
        label: formatDocumentTypeLabel(document.name),
        file: documentFiles[String(document.id)] || null,
      }))
      .filter((entry) => entry.file);

    if (!uploads.length) {
      return { failed: [], failedIds: [] };
    }

    const failed = [];
    const failedIds = [];

    for (const entry of uploads) {
      const formData = new FormData();
      formData.append("client_id", String(clientId));
      formData.append("document_type_id", String(entry.documentTypeId));
      formData.append("file", entry.file);

      try {
        const res = await api.post("client_upload_document.php", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        if (!res?.data?.success) {
          failed.push(`${entry.label}: ${res?.data?.message || "Upload failed."}`);
          failedIds.push(String(entry.documentTypeId));
        }
      } catch (uploadError) {
        failed.push(`${entry.label}: ${uploadError?.response?.data?.message || uploadError?.message || "Upload failed."}`);
        failedIds.push(String(entry.documentTypeId));
      }
    }

    return { failed, failedIds };
  };

  const checkEmailAvailability = async (rawEmail) => {
    const normalizedEmail = String(rawEmail || "").trim().toLowerCase();

    if (!normalizedEmail) {
      setEmailError("");
      return true;
    }

    if (!isValidEmail(normalizedEmail)) {
      return true;
    }

    try {
      setCheckingEmail(true);
      await api.post("client_create.php", {
        action: "check_email",
        email: normalizedEmail,
      });
      setEmailError("");
      return true;
    } catch (requestError) {
      const message = requestError?.response?.data?.message || "";
      if (requestError?.response?.status === 409) {
        setEmailError(message || DUPLICATE_EMAIL_MESSAGE);
        return false;
      }

      setEmailError("");
      throw requestError;
    } finally {
      setCheckingEmail(false);
    }
  };

  const validateForm = () => {
    const businessTypeId = normalizeIdValue(form.business.business_type_id);
    const hasSelectedBusinessType = businessTypes.some((option) => String(option.id) === String(businessTypeId ?? ""));

    if (!form.first_name.trim() || !form.last_name.trim()) {
      return "First name and last name are required.";
    }

    if (!form.email.trim()) {
      return "Email is required.";
    }

    if (!isValidEmail(form.email.trim())) {
      return "Enter a valid email address.";
    }

    if (!form.user_password) {
      return "Password is required.";
    }

    const passwordValidationError = validatePasswordValue(form.user_password, {
      maxPasswordLength: securitySettings.maxPasswordLength,
    });
    if (passwordValidationError) {
      return passwordValidationError;
    }

    if (form.user_password !== form.confirm_password) {
      return "Password confirmation does not match.";
    }

    if (form.phone.trim() && !isValidPhoneNumber(form.phone.trim())) {
      return "Enter a valid phone number.";
    }

    if (!form.address.street.trim()) {
      return "Street address is required.";
    }

    if (!form.address.province) {
      return "Select a province.";
    }

    if (!form.address.city) {
      return "Select a city or municipality.";
    }

    if (!form.address.barangay) {
      return "Select a barangay.";
    }

    if (!form.address.country.trim()) {
      return "Country is required.";
    }

    if (form.business.email_address.trim() && !isValidEmail(form.business.email_address.trim())) {
      return "Enter a valid business email address.";
    }

    if (form.business.contact_number.trim() && !isValidPhoneNumber(form.business.contact_number.trim())) {
      return "Enter a valid business contact number.";
    }

    if (hasBusinessDetails(form.business) && !hasSelectedBusinessType) {
      return "Select a valid type of business.";
    }

    if (!requiredDocumentTypes.length) {
      return "Required document types are not configured. Please contact the administrator.";
    }

    const missingRequiredDocs = requiredDocumentTypes.filter(
      (document) => !documentFiles[String(document.id)]
    );
    if (missingRequiredDocs.length) {
      const labels = missingRequiredDocs.map((document) => formatDocumentTypeLabel(document.name));
      return `Please upload the required documents: ${labels.join(", ")}.`;
    }

    if (!form.agreement) {
      return "You must confirm the agreement before creating an account.";
    }

    return "";
  };

  const handleEmailBlur = async () => {
    const normalizedEmail = form.email.trim().toLowerCase();
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return;
    }

    try {
      await checkEmailAvailability(normalizedEmail);
    } catch (_) {
      // Keep signup available even if the precheck endpoint is temporarily unavailable.
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setWarning("");

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setSubmitting(true);

      if (createdClientId) {
        const uploadResult = await uploadClientDocuments(createdClientId);
        const failedRequiredLabels = requiredDocumentTypes
          .filter((document) => uploadResult.failedIds.includes(String(document.id)))
          .map((document) => formatDocumentTypeLabel(document.name));

        if (failedRequiredLabels.length) {
          setError(
            `Required documents failed to upload: ${failedRequiredLabels.join(", ")}. Please try again.`
          );
          return;
        }

        const flashMessage = uploadResult.failed.length
          ? `Documents uploaded. Some optional documents could not be uploaded: ${uploadResult.failed.join(" | ")}`
          : "Documents uploaded successfully. Your account is pending admin approval. Use your email address as your username once your registration is approved. After approval, only Processing will be available until your Business Permit is uploaded.";

        navigate("/login", {
          replace: true,
          state: {
            flashMessage,
            flashType: uploadResult.failed.length ? "warning" : "success",
          },
        });
        return;
      }

      const emailAvailable = await checkEmailAvailability(form.email);
      if (!emailAvailable) {
        setError(DUPLICATE_EMAIL_MESSAGE);
        return;
      }

      const payload = buildPayload(form, businessTypes, {
        province: provinceName,
        municipality: municipalityName,
        barangay: barangayName,
        postalCode,
      }, {
        province: form.business.business_province,
        municipality: form.business.business_city,
        barangay: form.business.business_barangay,
        postalCode: form.business.business_postal_code,
      });
      const res = await api.post("client_create.php", payload);

      if (!res?.data?.success) {
        setError(res?.data?.message || "Unable to create account.");
        return;
      }

      const clientId = normalizeIdValue(res?.data?.client?.id);
      if (!clientId) {
        setError("Account created, but client reference was missing. Please contact the administrator.");
        return;
      }

      setCreatedClientId(clientId);
      const uploadResult = await uploadClientDocuments(clientId);
      const failedRequiredLabels = requiredDocumentTypes
        .filter((document) => uploadResult.failedIds.includes(String(document.id)))
        .map((document) => formatDocumentTypeLabel(document.name));

      if (failedRequiredLabels.length) {
        setError(
          `Account created, but required documents failed to upload: ${failedRequiredLabels.join(", ")}. Please try again.`
        );
        return;
      }

      const flashMessage = uploadResult.failed.length
        ? `Account created successfully. Your account is pending admin approval. Some optional documents could not be uploaded: ${uploadResult.failed.join(" | ")}`
        : "Account created successfully. Your account is pending admin approval. Use your email address as your username once your registration is approved. After approval, only Processing will be available until your Business Permit is uploaded.";

      navigate("/login", {
        replace: true,
        state: {
          flashMessage,
          flashType: uploadResult.failed.length ? "warning" : "success",
        },
      });
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || "Request failed.";
      if (requestError?.response?.status === 409 && message === DUPLICATE_EMAIL_MESSAGE) {
        setEmailError(message);
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode
          ? "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]"
          : "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_22%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_100%)]"
      }`}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="w-full max-w-5xl">
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white/70 p-5 shadow-[0_38px_110px_-80px_rgba(15,23,42,0.65)] backdrop-blur sm:p-8 lg:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.10),_transparent_40%)]" />

            <div className="relative mx-auto max-w-4xl">
              <div className="border-b border-slate-200/70 pb-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-3">
                      <img
                        src={appLogo}
                        alt="Guibone Accounting Services"
                        className="h-11 w-11 rounded-2xl border border-emerald-100 bg-emerald-50 object-contain p-1.5"
                      />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                          Client Sign Up
                        </p>
                        <p className="text-sm font-semibold text-slate-900">Guibone Accounting Services</p>
                      </div>
                    </div>

                    <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                      Create your client account
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                      Fill in your personal information, add optional business details, and upload requirements so your requests can be tracked clearly.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">Email becomes your username</span>
                      <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-700">Business details are optional</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Submit everything in one form</span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:max-w-xs lg:pt-1">
                    <Link
                      to="/"
                      className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                    >
                      Back to Landing Page
                    </Link>
                    <Link
                      to="/login"
                      className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
                    >
                      Already registered? Sign in
                    </Link>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <StatusMessage tone="error">{error}</StatusMessage>
              <StatusMessage tone="warning">{warning}</StatusMessage>

              <SectionPanel
                title="Personal Information"
                description="Provide your basic client details and account credentials."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <InputField
                    label="First Name"
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    required
                    autoComplete="given-name"
                  />
                  <InputField
                    label="Middle Name"
                    name="middle_name"
                    value={form.middle_name}
                    onChange={handleChange}
                    autoComplete="additional-name"
                  />
                  <InputField
                    label="Last Name"
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    required
                    autoComplete="family-name"
                  />
                  <InputField
                    label="Email Address"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    onBlur={handleEmailBlur}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    error={emailError}
                  />
                  <InputField
                    label="Password"
                    name="user_password"
                    type={showPassword ? "text" : "password"}
                    value={form.user_password}
                    onChange={handleChange}
                    required
                    autoComplete="new-password"
                    maxLength={securitySettings.maxPasswordLength}
                    rightAdornment={
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="rounded-lg px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    }
                  />
                  <InputField
                    label="Confirm Password"
                    name="confirm_password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirm_password}
                    onChange={handleChange}
                    required
                    autoComplete="new-password"
                    maxLength={securitySettings.maxPasswordLength}
                    rightAdornment={
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="rounded-lg px-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    }
                  />
                  <div className="md:col-span-2 -mt-1">
                    <PasswordRequirementsPanel
                      password={form.user_password}
                      confirmPassword={form.confirm_password}
                      maxPasswordLength={securitySettings.maxPasswordLength}
                      showConfirmation
                      active={Boolean(form.user_password) || Boolean(form.confirm_password)}
                    />
                  </div>
                  <InputField
                    label="Phone Number"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    autoComplete="tel"
                    placeholder="+63 900 000 0000"
                  />
                  <InputField
                    label="Date of Birth"
                    name="date_of_birth"
                    type="date"
                    value={form.date_of_birth}
                    onChange={handleChange}
                  />
                  <SelectField
                    label="Civil Status"
                    name="civil_status_type_id"
                    value={form.civil_status_type_id}
                    onChange={handleChange}
                    options={civilStatusTypes}
                    placeholder="Select civil status"
                  />
                  <InputField
                    label="TIN Number"
                    name="tin_no"
                    value={form.tin_no}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                  <div className="md:col-span-2 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Address Details</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Select from the dropdowns to prevent typing errors.
                      </p>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2">
                      <InputField
                        label="Street Address / House No."
                        name="street"
                        value={form.address.street}
                        onChange={handleAddressChange}
                        placeholder="House no., street, subdivision"
                        autoComplete="address-line1"
                        required
                        containerClassName="md:col-span-2"
                      />
                      <AddressFields
                        provinceValue={form.address.province}
                        cityValue={form.address.city}
                        barangayValue={form.address.barangay}
                        provinces={provinceOptions}
                        cities={cityOptions}
                        barangays={barangayOptions}
                        onProvinceChange={handleProvinceChange}
                        onCityChange={handleCityChange}
                        onBarangayChange={handleBarangayChange}
                        cityDisabled={isCityDisabled}
                        barangayDisabled={isBarangayDisabled}
                        required
                      />
                      <InputField
                        label="Postal Code / ZIP Code"
                        name="postalCode"
                        value={postalCode}
                        readOnly
                        helperText={postalHelperText}
                        autoComplete="postal-code"
                        containerClassName="md:col-span-1"
                      />
                      <InputField
                        label="Country"
                        name="country"
                        value={form.address.country}
                        readOnly
                        helperText="Currently limited to Philippine addresses."
                        autoComplete="country-name"
                        containerClassName="md:col-span-2"
                      />
                    </div>
                  </div>
                </div>
              </SectionPanel>

              <SectionPanel
                title="Business Details"
                description="Add the business information you want tracked in the system. This section is optional."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <InputField
                    label="Trade Name"
                    name="trade_name"
                    value={form.business.trade_name}
                    onChange={handleBusinessChange}
                  />
                  <SelectField
                    label="Type of Business"
                    name="business_type_id"
                    value={form.business.business_type_id}
                    onChange={handleBusinessChange}
                    options={businessTypes}
                    placeholder="Select business type"
                  />
                  <InputField
                    label="Business Email"
                    name="email_address"
                    type="email"
                    value={form.business.email_address}
                    onChange={handleBusinessChange}
                    placeholder="business@example.com"
                  />
                  <InputField
                    label="Business TIN"
                    name="tin_number"
                    value={form.business.tin_number}
                    onChange={handleBusinessChange}
                  />
                  <InputField
                    label="Business Contact Number"
                    name="contact_number"
                    value={form.business.contact_number}
                    onChange={handleBusinessChange}
                    placeholder="+63 900 000 0000"
                  />
                  <div className="md:col-span-2 space-y-4">
                    <BusinessAddressMapSelector
                      value={{
                        street: form.business.business_address,
                        barangay: form.business.business_barangay,
                        city: form.business.business_city,
                        province: form.business.business_province,
                        postalCode: form.business.business_postal_code,
                        country: form.business.business_country,
                      }}
                      onChange={handleBusinessLocationChange}
                    />
                  </div>
                </div>
              </SectionPanel>

              <SectionPanel
                title="Document Upload"
                description="Upload the required documents to complete your registration. Marriage Contract, Business Permit, DTI, SEC, and LGU files can also be attached here when available, but they are optional."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  {signupDocumentTypes.map((document) => (
                    <DocumentUploadField
                      key={document.id}
                      document={document}
                      selectedFile={documentFiles[String(document.id)]}
                      onFileChange={handleDocumentFileChange}
                      required={requiredDocumentIds.includes(String(document.id))}
                    />
                  ))}
                </div>

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Accepted file types: PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, JPEG, PNG, GIF, and WEBP. Maximum file
                  size is 10MB per upload.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Required: {requiredDocumentLabels.length ? requiredDocumentLabels.join(", ") : "PSA Birth Certificate, Valid ID"}.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Optional: Marriage Contract (if applicable), Business Permit, DTI, SEC, and LGU.
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  If you sign up without a Business Permit, Create Appointment will show only Processing until the admin uploads your permit and your business becomes registered.
                </p>

                <label className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-emerald-50/70 px-4 py-4 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="agreement"
                    checked={form.agreement}
                    onChange={handleChange}
                    required
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>I confirm that all the information I have provided is accurate and complete.</span>
                </label>
              </SectionPanel>

              <div className="mx-auto max-w-xl space-y-3 pt-1">
                <p className="text-center text-sm leading-6 text-slate-500">
                  By creating an account, you allow the system to track your client records, appointments, and service
                  requests.
                </p>
                <button
                  type="submit"
                  disabled={submitting || checkingEmail}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Creating account..." : checkingEmail ? "Checking email..." : "Sign Up"}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

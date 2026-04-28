import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/UI/buttons";
import { Modal } from "../../components/UI/modal";
import { api, resolveBackendAssetUrl } from "../../services/api";
import {
  joinPersonName,
  normalizeMiddleName,
  normalizeMiddleNameOrNull,
  normalizePersonName,
} from "../../utils/person_name";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

const EMPTY_FORM = Object.freeze({
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone_number: "",
});

const DEFAULT_PROFILE_COPY = Object.freeze({
  fallbackName: "Admin",
  fallbackInitials: "AD",
  missingProfileMessage: "No linked admin profile was found for this account.",
  notFoundMessage: "Admin profile not found.",
  loadErrorMessage: "Unable to load your admin profile right now.",
  description: "View and manage your administrator account details.",
  roleInfoLabel: "Admin Role",
  defaultRoleLabel: "Admin",
});

function buildFullName(profile, fallbackName = "Admin") {
  const name = joinPersonName([
    profile?.first_name ?? profile?.employee_first_name,
    profile?.middle_name ?? profile?.employee_middle_name,
    profile?.last_name ?? profile?.employee_last_name,
  ]);

  if (name) return name;
  return String(profile?.email || profile?.username || fallbackName).trim() || fallbackName;
}

function buildInitials(value, fallbackInitials = "AD") {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || fallbackInitials
  );
}

function createFormState(profile) {
  return {
    first_name: normalizePersonName(profile?.first_name ?? profile?.employee_first_name),
    middle_name: normalizeMiddleName(profile?.middle_name ?? profile?.employee_middle_name),
    last_name: normalizePersonName(profile?.last_name ?? profile?.employee_last_name),
    email: String(profile?.email || "").trim(),
    phone_number: String(profile?.employee_phone_number ?? profile?.phone_number ?? "").trim(),
  };
}

function normalizeRoleLabel(profile, user, defaultRoleLabel = "Admin") {
  const direct = String(profile?.role_name || profile?.role || "").trim();
  if (direct) return direct;

  const roleId = Number(profile?.role_id ?? user?.role_id ?? user?.role ?? 1);
  if (roleId === 2) return "Secretary";
  if (roleId === 3) return "Accountant";
  if (roleId === 4) return "Client";
  return defaultRoleLabel;
}

function InfoField({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-900">{value || "-"}</div>
    </div>
  );
}

export default function AdminProfile({ open, onClose, user, onProfileUpdated, copy = DEFAULT_PROFILE_COPY }) {
  const userId = Number(user?.id ?? user?.User_ID ?? 0);
  const profileCopy = useMemo(
    () => ({
      ...DEFAULT_PROFILE_COPY,
      ...(copy && typeof copy === "object" ? copy : {}),
    }),
    [copy]
  );

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useErrorToast(error);
  useErrorToast(saveError);
  const [successMessage, setSuccessMessage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  const loadProfile = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!(userId > 0)) {
        setProfile(null);
        setForm(EMPTY_FORM);
        setError(profileCopy.missingProfileMessage);
        return;
      }

      try {
        if (showLoading) setLoading(true);
        setError("");

        const usersRes = await api.get("user_list.php", {
          params: { user_id: userId },
        });
        const nextProfile =
          usersRes?.data?.user ||
          (Array.isArray(usersRes?.data?.users) ? usersRes.data.users[0] : null) ||
          null;

        if (!nextProfile) {
          throw new Error(profileCopy.notFoundMessage);
        }

        setProfile(nextProfile);
        setForm(createFormState(nextProfile));
      } catch (loadError) {
        setProfile(null);
        setForm(EMPTY_FORM);
        setError(
          loadError?.response?.data?.message ||
            loadError?.message ||
            profileCopy.loadErrorMessage
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [profileCopy.loadErrorMessage, profileCopy.missingProfileMessage, profileCopy.notFoundMessage, userId]
  );

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setSaveError("");
      setSuccessMessage("");
      return;
    }

    loadProfile();
  }, [open, loadProfile]);

  const displayName = useMemo(
    () => buildFullName(profile || user, profileCopy.fallbackName),
    [profile, profileCopy.fallbackName, user]
  );
  const initials = useMemo(
    () => buildInitials(displayName, profileCopy.fallbackInitials),
    [displayName, profileCopy.fallbackInitials]
  );
  const roleLabel = useMemo(
    () => normalizeRoleLabel(profile, user, profileCopy.defaultRoleLabel),
    [profile, profileCopy.defaultRoleLabel, user]
  );
  const profileImageUrl = useMemo(
    () => resolveBackendAssetUrl(profile?.profile_image || user?.profile_image),
    [profile, user]
  );
  const specializationLabel = useMemo(
    () => String(profile?.employee_specialization_type_name || "").trim(),
    [profile]
  );

  const handleClose = () => {
    if (saving || uploadingImage) return;
    setIsEditing(false);
    setSaveError("");
    setSuccessMessage("");
    onClose?.();
  };

  const handleChange = (field) => (event) => {
    const value = event?.target?.value ?? "";
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleStartEdit = () => {
    setForm(createFormState(profile));
    setSaveError("");
    setSuccessMessage("");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setForm(createFormState(profile));
    setSaveError("");
    setSuccessMessage("");
    setIsEditing(false);
  };

  const handleChooseImage = () => {
    if (uploadingImage || saving) return;
    fileInputRef.current?.click();
  };

  const handleImageSelected = async (event) => {
    const file = event?.target?.files?.[0] || null;
    if (!file) return;

    const normalizedName = String(file.name || "").toLowerCase();
    const isAllowed = [".jpg", ".jpeg", ".png", ".gif", ".webp"].some((extension) =>
      normalizedName.endsWith(extension)
    );

    if (!isAllowed) {
      setSaveError("Please upload a JPG, PNG, GIF, or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSaveError("Profile image must be 5MB or smaller.");
      event.target.value = "";
      return;
    }

    setUploadingImage(true);
    setSaveError("");
    setSuccessMessage("");

    try {
      const formData = new FormData();
      formData.append("action", "update_profile_image");
      formData.append("id", String(userId));
      formData.append("profile_image", file);

      const res = await api.post("user_update.php", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Unable to upload profile image.");
      }

      const nextProfile = res?.data?.user || null;

      if (nextProfile) {
        const mergedProfile = {
          ...(profile || {}),
          ...nextProfile,
        };

        setProfile(mergedProfile);
        onProfileUpdated?.(mergedProfile);
      }

      setSuccessMessage(res?.data?.message || "Profile image uploaded successfully.");
    } catch (uploadError) {
      setSaveError(
        uploadError?.response?.data?.message ||
          uploadError?.message ||
          "Unable to upload profile image right now."
      );
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const handleSave = async () => {
    const firstName = normalizePersonName(form.first_name);
    const middleName = normalizeMiddleName(form.middle_name);
    const lastName = normalizePersonName(form.last_name);
    const email = String(form.email || "").trim();
    const phoneNumber = String(form.phone_number || "").trim();

    if (!firstName || !lastName) {
      setSaveError("First name and last name are required.");
      return;
    }

    if (!email) {
      setSaveError("Email is required.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSuccessMessage("");

    try {
      const res = await api.post("user_update.php", {
        id: userId,
        email,
        employee_details: {
          first_name: firstName,
          middle_name: normalizeMiddleNameOrNull(middleName),
          last_name: lastName,
          phone_number: phoneNumber || null,
        },
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Unable to update profile.");
      }

      const nextProfile = res?.data?.user || null;

      if (nextProfile) {
        setProfile((current) => ({
          ...(current || {}),
          ...nextProfile,
        }));
        setForm(createFormState(nextProfile));
      }

      onProfileUpdated?.({
        username: nextProfile?.username ?? user?.username ?? null,
        first_name: firstName,
        middle_name: normalizeMiddleNameOrNull(middleName),
        last_name: lastName,
        email,
        profile_image: nextProfile?.profile_image ?? profile?.profile_image ?? user?.profile_image ?? null,
      });

      setIsEditing(false);
      showSuccessToast(res?.data?.message || "Profile updated successfully.");
    } catch (saveProfileError) {
      setSaveError(
        saveProfileError?.response?.data?.message ||
          saveProfileError?.message ||
          "Unable to update profile right now."
      );
    } finally {
      setSaving(false);
    }
  };

  const footer = isEditing ? (
    <>
      <Button variant="secondary" onClick={handleCancelEdit} disabled={saving || uploadingImage}>
        Cancel
      </Button>
      <Button variant="success" onClick={handleSave} disabled={saving || uploadingImage}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
      <Button variant="secondary" onClick={handleClose} disabled={saving || uploadingImage}>
        Close
      </Button>
    </>
  ) : (
    <>
      <Button onClick={handleStartEdit} disabled={loading || uploadingImage || !profile}>
        Edit Profile
      </Button>
      <Button variant="secondary" onClick={handleClose} disabled={uploadingImage}>
        Close
      </Button>
    </>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="My Profile"
        description={profileCopy.description}
        size="lg"
        footer={footer}
      >
        {loading ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-3xl bg-slate-100" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : (
          <div className="space-y-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,image/*"
              onChange={handleImageSelected}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-4 rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-sky-700 to-cyan-800 px-5 py-6 text-center text-white shadow-lg sm:flex-row sm:items-center sm:text-left">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={displayName}
                  className="h-24 w-24 rounded-3xl border border-white/20 object-cover shadow-lg"
                />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-3xl border border-white/15 bg-white/10 text-2xl font-bold tracking-wide">
                  {initials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                    {roleLabel}
                  </div>
                  {specializationLabel ? (
                    <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                      {specializationLabel}
                    </div>
                  ) : null}
                </div>
                <h3 className="mt-3 break-words text-2xl font-semibold text-white">{displayName}</h3>
                <p className="mt-1 break-all text-sm text-slate-200">{profile?.email || "-"}</p>
              </div>
            </div>

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            {saveError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {saveError}
              </div>
            ) : null}

            {isEditing ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    First Name
                  </span>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={handleChange("first_name")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Enter first name"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Middle Name
                  </span>
                  <input
                    type="text"
                    value={form.middle_name}
                    onChange={handleChange("middle_name")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Optional"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Last Name
                  </span>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={handleChange("last_name")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Enter last name"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Contact Number
                  </span>
                  <input
                    type="text"
                    value={form.phone_number}
                    onChange={handleChange("phone_number")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Enter contact number"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Email
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    placeholder="Enter email address"
                  />
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Profile Image
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Upload a new profile image while editing your account.
                      </div>
                      <div className="mt-1 text-xs text-slate-500">JPG, PNG, GIF, WEBP up to 5MB</div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleChooseImage}
                      disabled={uploadingImage || saving}
                    >
                      {uploadingImage ? "Uploading..." : "Upload New Image"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-800 sm:col-span-2">
                  Role and specialization are controlled by system configuration and cannot be edited here.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoField label="Full Name" value={displayName} />
                <InfoField label="Email" value={profile?.email} />
                <InfoField label="Contact Number" value={profile?.employee_phone_number || profile?.phone_number} />
                <InfoField label="Position" value={profile?.employee_position} />
                <InfoField label="Specialization" value={specializationLabel} />
                <InfoField label={profileCopy.roleInfoLabel} value={roleLabel} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

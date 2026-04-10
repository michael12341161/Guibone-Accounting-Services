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
  phone: "",
});

function buildFullName(profile) {
  const name = joinPersonName([profile?.first_name, profile?.middle_name, profile?.last_name]);

  if (name) return name;
  return String(profile?.email || profile?.username || "Client").trim() || "Client";
}

function buildInitials(value) {
  return (
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CL"
  );
}

function createFormState(profile) {
  return {
    first_name: normalizePersonName(profile?.first_name),
    middle_name: normalizeMiddleName(profile?.middle_name),
    last_name: normalizePersonName(profile?.last_name),
    email: String(profile?.email || "").trim(),
    phone: String(profile?.phone || "").trim(),
  };
}

function normalizeRoleLabel(profile, user) {
  const direct = String(profile?.role_name || profile?.role || "").trim();
  if (direct) return direct;

  const roleId = Number(profile?.role_id ?? user?.role_id ?? user?.role ?? 4);
  if (roleId === 1) return "Admin";
  if (roleId === 2) return "Secretary";
  if (roleId === 3) return "Accountant";
  return "Client";
}

function InfoField({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-slate-900">{value || "-"}</div>
    </div>
  );
}

export default function ClientProfile({ open, onClose, user, onProfileUpdated, readOnly = false }) {
  const clientId = Number(
    user?.client_id ??
      user?.Client_ID ??
      user?.Client_id ??
      user?.clientId ??
      0
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

  const loadProfile = useCallback(async ({ showLoading = true } = {}) => {
    if (!(clientId > 0)) {
      setProfile(null);
      setForm(EMPTY_FORM);
      setError("No linked client profile was found for this account.");
      return;
    }

    try {
      if (showLoading) setLoading(true);
      setError("");

      const clientRes = await api.get("client_list.php", { params: { client_id: clientId } });

      const clients = Array.isArray(clientRes?.data?.clients) ? clientRes.data.clients : [];
      const nextProfile = clients[0] || null;

      if (!nextProfile) {
        throw new Error("Client profile not found.");
      }

      setProfile(nextProfile);
      setForm(createFormState(nextProfile));
    } catch (loadError) {
      setProfile(null);
      setForm(EMPTY_FORM);
      setError(
        loadError?.response?.data?.message ||
          loadError?.message ||
          "Unable to load your client profile right now."
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setSaveError("");
      setSuccessMessage("");
      return;
    }

    loadProfile();
  }, [open, loadProfile]);

  useEffect(() => {
    if (!readOnly) return;
    setIsEditing(false);
  }, [readOnly]);

  const displayName = useMemo(() => buildFullName(profile || user), [profile, user]);
  const roleLabel = useMemo(() => normalizeRoleLabel(profile, user), [profile, user]);
  const profileImageUrl = useMemo(
    () => resolveBackendAssetUrl(profile?.profile_image || user?.profile_image),
    [profile, user]
  );
  const initials = useMemo(() => buildInitials(displayName), [displayName]);

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
    if (readOnly) return;
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
    if (readOnly) return;
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
      formData.append("client_id", String(clientId));
      formData.append("profile_image", file);

      const res = await api.post("client_create.php", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Unable to upload profile image.");
      }

      const nextProfile = res?.data?.client || null;

      if (nextProfile) {
        const mergedProfile = {
          ...(profile || {}),
          ...nextProfile,
        };

        setProfile(mergedProfile);
        onProfileUpdated?.(mergedProfile);
      }

      setSuccessMessage(res?.data?.message || "Profile image uploaded successfully.");
      await loadProfile({ showLoading: false });
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
    if (readOnly) return;

    const firstName = normalizePersonName(form.first_name);
    const middleName = normalizeMiddleName(form.middle_name);
    const lastName = normalizePersonName(form.last_name);
    const email = String(form.email || "").trim();
    const phone = String(form.phone || "").trim();

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
      const res = await api.post("client_create.php", {
        action: "update",
        client_id: clientId,
        first_name: firstName,
        middle_name: normalizeMiddleNameOrNull(middleName),
        last_name: lastName,
        email,
        phone: phone || null,
        status_id: profile?.status_id ?? 1,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.message || "Unable to update profile.");
      }

      const nextProfile = res?.data?.client || null;

      if (nextProfile) {
        setProfile((current) => ({
          ...(current || {}),
          ...nextProfile,
        }));
        setForm(createFormState(nextProfile));
      }

      onProfileUpdated?.({
        first_name: firstName,
        middle_name: normalizeMiddleNameOrNull(middleName),
        last_name: lastName,
        email,
        profile_image: profile?.profile_image ?? user?.profile_image ?? null,
      });

      setIsEditing(false);
      showSuccessToast(res.data?.message || "Profile updated successfully.");
      await loadProfile({ showLoading: false });
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

  const footer = readOnly ? (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={uploadingImage}>
        Close
      </Button>
    </>
  ) : isEditing ? (
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
        description={
          readOnly
            ? "View this client account in read-only mode while signed in from a staff account."
            : "View and manage your client account details."
        }
        size="md"
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

            <div className="flex flex-col items-center gap-4 rounded-[1.75rem] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-5 py-6 text-center text-white shadow-lg sm:flex-row sm:items-center sm:text-left">
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
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100">
                  {roleLabel}
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

            {readOnly ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Staff access to client accounts is view-only. Editing, password changes, and uploads are disabled.
              </div>
            ) : null}

            {isEditing && !readOnly ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    First Name
                  </span>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={handleChange("first_name")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    placeholder="Enter last name"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Contact Number
                  </span>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={handleChange("phone")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
                        Upload a new profile image after clicking edit profile.
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
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoField label="Full Name" value={displayName} />
                <InfoField label="Email" value={profile?.email} />
                <InfoField label="Contact Number" value={profile?.phone} />
                <InfoField label="Client Role" value={roleLabel} />
              </div>
            )}
          </div>
        )}
      </Modal>

    </>
  );
}

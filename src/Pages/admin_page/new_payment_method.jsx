import React, { useEffect, useMemo, useState } from "react";
import { Button, IconButton } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { DataTable } from "../../components/UI/table";
import { createPaymentMethod, fetchPaymentMethods, updatePaymentMethod } from "../../services/api";
import { showSuccessToast, useErrorToast } from "../../utils/feedback";

function normalizePaymentMethodName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createInitialForm() {
  return {
    paymentMethodId: "",
    paymentMethodName: "",
    description: "",
    disabled: false,
  };
}

export default function NewPaymentMethod() {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [form, setForm] = useState(createInitialForm);
  const [fieldError, setFieldError] = useState("");
  const [search, setSearch] = useState("");

  useErrorToast(error);

  const loadPaymentMethods = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      const response = await fetchPaymentMethods({
        params: {
          include_disabled: 1,
        },
      });
      const nextPaymentMethods = Array.isArray(response?.data?.payment_methods)
        ? response.data.payment_methods
        : [];
      setPaymentMethods(nextPaymentMethods);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load payment methods."
      );
      if (!silent) {
        setPaymentMethods([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadPaymentMethods({ silent: false });
  }, []);

  const normalizedPaymentMethods = useMemo(
    () =>
      (Array.isArray(paymentMethods) ? paymentMethods : [])
      .map((method) => ({
        id: String(method?.id ?? "").trim() || normalizePaymentMethodName(method?.name),
        paymentMethodId: String(method?.id ?? "").trim(),
        name: normalizePaymentMethodName(method?.name),
        description: String(method?.description || "").trim(),
        disabled: Boolean(method?.disabled),
      })),
    [paymentMethods]
  );

  const paymentMethodRows = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();

    return normalizedPaymentMethods
      .filter((method) => {
        if (!query) return true;
        return `${method.name} ${method.description} ${method.disabled ? "disabled" : "active"}`
          .toLowerCase()
          .includes(query);
      });
  }, [normalizedPaymentMethods, search]);

  const validateForm = () => {
    const normalizedName = normalizePaymentMethodName(form.paymentMethodName);
    const normalizedDescription = String(form.description || "").trim();

    if (!normalizedName) {
      return "Payment method name is required.";
    }

    if (normalizedName.length > 50) {
      return "Payment method name must be 50 characters or fewer.";
    }

    if (normalizedDescription.length > 255) {
      return "Description must be 255 characters or fewer.";
    }

    const duplicate = normalizedPaymentMethods.some((method) => {
      if (String(method.paymentMethodId) === String(form.paymentMethodId || "")) {
        return false;
      }

      return String(method.name || "").trim().toLowerCase() === normalizedName.toLowerCase();
    });
    if (duplicate) {
      return "Another payment method already uses that name.";
    }

    return "";
  };

  const openCreateModal = () => {
    setModalMode("create");
    setForm(createInitialForm());
    setFieldError("");
    setModalOpen(true);
  };

  const openEditModal = (method) => {
    setModalMode("edit");
    setForm({
      paymentMethodId: String(method?.paymentMethodId || ""),
      paymentMethodName: String(method?.name || ""),
      description: String(method?.description || ""),
      disabled: Boolean(method?.disabled),
    });
    setFieldError("");
    setModalOpen(true);
  };

  const closeModal = (force = false) => {
    if (submitting && !force) return;
    setModalOpen(false);
    setFieldError("");
    setForm(createInitialForm());
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationMessage = validateForm();
    setFieldError(validationMessage);
    if (validationMessage) {
      return;
    }

    const payload = {
      name: normalizePaymentMethodName(form.paymentMethodName),
      description: String(form.description || "").trim(),
    };

    try {
      setSubmitting(true);
      setError("");

      if (modalMode === "edit" && form.paymentMethodId) {
        await updatePaymentMethod({
          payment_type_id: Number(form.paymentMethodId),
          ...payload,
        });
        showSuccessToast("Payment method updated successfully.");
      } else {
        await createPaymentMethod(payload);
        showSuccessToast("Payment method added successfully.");
      }

      closeModal(true);
      await loadPaymentMethods({ silent: false });
    } catch (requestError) {
      const nextMessage =
        requestError?.response?.data?.message ||
        requestError?.message ||
        "Unable to save the payment method.";
      if ([409, 422].includes(Number(requestError?.response?.status || 0))) {
        setFieldError(nextMessage);
      } else {
        setError(nextMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisableToggle = async (paymentMethod) => {
    try {
      setError("");
      await updatePaymentMethod({
        payment_type_id: Number(paymentMethod.paymentMethodId),
        name: paymentMethod.name,
        description: paymentMethod.description,
        disabled: !paymentMethod.disabled,
      });
      showSuccessToast(
        paymentMethod.disabled ? "Payment method enabled successfully." : "Payment method disabled successfully."
      );
      await loadPaymentMethods({ silent: true });
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message || requestError?.message || "Unable to update the payment method."
      );
    }
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      width: "28%",
      render: (value) => <div className="min-w-[220px] font-medium text-slate-900">{value}</div>,
    },
    {
      key: "description",
      header: "Description",
      render: (value) => (
        <div className="min-w-[280px] text-sm text-slate-600">
          {value || "No description added yet."}
        </div>
      ),
    },
    {
      key: "disabled",
      header: "Status",
      width: "16%",
      render: (value) => (
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            value
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {value ? "Disabled" : "Active"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "18%",
      align: "center",
      render: (_, row) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton
            size="sm"
            variant="secondary"
            title="Edit payment method"
            aria-label={`Edit ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              openEditModal(row);
            }}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
          </IconButton>
          <IconButton
            size="sm"
            variant={row.disabled ? "success" : "danger"}
            title={row.disabled ? "Enable payment method" : "Disable payment method"}
            aria-label={row.disabled ? `Enable ${row.name}` : `Disable ${row.name}`}
            onClick={(event) => {
              event.stopPropagation();
              handleDisableToggle(row);
            }}
          >
            {row.disabled ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
              </svg>
            )}
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Manage the payment methods clients can choose when uploading receipts.</CardDescription>
          </div>
          <div className="w-full sm:w-72">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payment methods..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
                {paymentMethodRows.length} payment method{paymentMethodRows.length === 1 ? "" : "s"} found
              </div>
              <Button type="button" onClick={openCreateModal}>
                Add Payment Method
              </Button>
            </div>

            <DataTable
              columns={columns}
              rows={paymentMethodRows}
              keyField="id"
              loading={loading}
              emptyMessage="No payment methods found."
              stickyHeader
              maxHeight="620px"
            />
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === "edit" ? "Edit Payment Method" : "Add Payment Method"}
        description="Create or update the payment methods available to clients."
        size="lg"
        closeOnOverlayClick={!submitting}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="payment-method-form" disabled={submitting}>
              {submitting ? "Saving..." : modalMode === "edit" ? "Save Changes" : "Create Payment Method"}
            </Button>
          </>
        }
      >
        <form id="payment-method-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="payment-method-name" className="mb-1 block text-xs font-medium text-slate-600">
              Payment Method Name
            </label>
            <input
              id="payment-method-name"
              type="text"
              value={form.paymentMethodName}
              onChange={(event) => {
                setForm((current) => ({ ...current, paymentMethodName: event.target.value }));
                if (fieldError) {
                  setFieldError("");
                }
              }}
              maxLength={50}
              disabled={submitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
              placeholder="Enter payment method name"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="payment-method-description" className="mb-1 block text-xs font-medium text-slate-600">
              Description
            </label>
            <textarea
              id="payment-method-description"
              rows={4}
              value={form.description}
              onChange={(event) => {
                setForm((current) => ({ ...current, description: event.target.value }));
                if (fieldError) {
                  setFieldError("");
                }
              }}
              maxLength={255}
              disabled={submitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100"
              placeholder="Describe how clients should use this payment method"
            />
          </div>

          {fieldError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{fieldError}</div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}

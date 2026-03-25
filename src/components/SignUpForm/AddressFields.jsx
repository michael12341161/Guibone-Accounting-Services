import React from "react";
import Select from "react-select";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: "52px",
    borderRadius: "1rem",
    borderColor: state.isFocused ? "#10b981" : "var(--theme-border-strong)",
    boxShadow: state.isFocused ? "0 0 0 4px rgba(16, 185, 129, 0.15)" : "none",
    "&:hover": {
      borderColor: state.isFocused ? "#10b981" : "var(--theme-border)",
    },
    backgroundColor: state.isDisabled ? "var(--theme-surface-muted)" : "var(--theme-surface)",
  }),
  valueContainer: (base) => ({
    ...base,
    padding: "0 16px",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--theme-text-muted)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--theme-text-primary)",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "1rem",
    overflow: "hidden",
    backgroundColor: "var(--theme-surface)",
    border: "1px solid var(--theme-border)",
    boxShadow: "0 12px 35px -18px rgba(15, 23, 42, 0.65)",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--theme-emerald-soft)"
      : state.isFocused
        ? "var(--theme-hover)"
        : "var(--theme-surface)",
    color: "var(--theme-text-primary)",
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "var(--theme-border)",
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? "#10b981" : "var(--theme-text-muted)",
    "&:hover": { color: "#10b981" },
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

function findOption(options, value) {
  if (!value) return null;
  return options.find((option) => String(option.value) === String(value)) || null;
}

function SelectField({
  label,
  name,
  value,
  onChange,
  options = [],
  placeholder = "Select an option",
  required = false,
  disabled = false,
  containerClassName = "",
  isSearchable = true,
}) {
  return (
    <div className={containerClassName}>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </label>
      <Select
        inputId={name}
        instanceId={name}
        value={findOption(options, value)}
        onChange={(option) => onChange(option?.value ?? "")}
        options={options}
        placeholder={placeholder}
        isDisabled={disabled}
        isSearchable={isSearchable}
        menuPlacement="bottom"
        menuPosition="fixed"
        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
        styles={selectStyles}
      />
    </div>
  );
}

export default function AddressFields({
  provinceValue,
  cityValue,
  barangayValue,
  provinces = [],
  cities = [],
  barangays = [],
  onProvinceChange,
  onCityChange,
  onBarangayChange,
  cityDisabled = false,
  barangayDisabled = false,
  required = false,
}) {
  return (
    <>
      <SelectField
        label="Province"
        name="province"
        value={provinceValue}
        onChange={onProvinceChange}
        options={provinces}
        placeholder="Select province"
        required={required}
      />
      <SelectField
        label="City / Municipality"
        name="city"
        value={cityValue}
        onChange={onCityChange}
        options={cities}
        placeholder={provinceValue ? "Select city or municipality" : "Select a province first"}
        required={required}
        disabled={cityDisabled}
      />
      <SelectField
        label="Barangay"
        name="barangay"
        value={barangayValue}
        onChange={onBarangayChange}
        options={barangays}
        placeholder={cityValue ? "Select barangay" : "Select a city/municipality first"}
        required={required}
        disabled={barangayDisabled}
      />
    </>
  );
}

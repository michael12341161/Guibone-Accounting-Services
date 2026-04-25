import { useCallback, useMemo, useEffect } from "react";
import addressData from "../data/ph-address.json";
import { getPostalCode } from "../services/postalService";
import { repairUtf8Mojibake } from "../utils/text_normalization";

const safeArray = (value) => (Array.isArray(value) ? value : []);
const normalizeLookupValue = (value) =>
  repairUtf8Mojibake(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function normalizeEntityRecord(record, keys) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const currentKey = keys.find((key) => String(record?.[key] ?? "").trim() !== "");
  const normalizedName = repairUtf8Mojibake(currentKey ? record[currentKey] : "");
  if (!normalizedName) {
    return record;
  }

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      record[key] = normalizedName;
    }
  });

  return record;
}

const resolveProvinceCode = (province) =>
  String(province?.code ?? province?.province_code ?? province?.provinceCode ?? "");
const resolveProvinceName = (province) =>
  repairUtf8Mojibake(province?.name ?? province?.province_name ?? province?.province ?? "");

const resolveCityCode = (city) => String(city?.code ?? city?.city_code ?? city?.cityCode ?? "");
const resolveCityName = (city) => repairUtf8Mojibake(city?.name ?? city?.city_name ?? city?.city ?? "");
const resolveCityProvinceCode = (city) =>
  String(city?.provinceCode ?? city?.province_code ?? "");

const resolveBarangayCode = (barangay) =>
  String(barangay?.code ?? barangay?.brgy_code ?? barangay?.barangay_code ?? "");
const resolveBarangayName = (barangay) =>
  repairUtf8Mojibake(barangay?.name ?? barangay?.brgy_name ?? barangay?.barangay_name ?? "");
const resolveBarangayCityCode = (barangay) =>
  String(barangay?.cityCode ?? barangay?.city_code ?? "");

const rawProvinces = safeArray(addressData?.provinces).map((province) =>
  normalizeEntityRecord(province, ["name", "province_name", "province"])
);
const rawCities = safeArray(addressData?.cities).map((city) =>
  normalizeEntityRecord(city, ["name", "city_name", "city"])
);
const rawBarangays = safeArray(addressData?.barangays).map((barangay) =>
  normalizeEntityRecord(barangay, ["name", "brgy_name", "barangay_name"])
);

const provincesByCode = new Map();
const provincesByName = new Map();
const citiesByCode = new Map();
const citiesByProvinceAndName = new Map();
const barangaysByCode = new Map();
const barangaysByCityAndName = new Map();
const citiesByProvince = new Map();
const barangaysByCity = new Map();

rawProvinces.forEach((province) => {
  const code = resolveProvinceCode(province);
  const nameKey = normalizeLookupValue(resolveProvinceName(province));
  if (code) {
    provincesByCode.set(code, province);
  }
  if (nameKey && !provincesByName.has(nameKey)) {
    provincesByName.set(nameKey, province);
  }
});

rawCities.forEach((city) => {
  const code = resolveCityCode(city);
  const provinceCode = resolveCityProvinceCode(city);
  const nameKey = normalizeLookupValue(resolveCityName(city));
  if (code) {
    citiesByCode.set(code, city);
  }
  if (provinceCode && nameKey) {
    const lookupKey = `${provinceCode}::${nameKey}`;
    if (!citiesByProvinceAndName.has(lookupKey)) {
      citiesByProvinceAndName.set(lookupKey, city);
    }
  }
  if (!provinceCode) return;
  const list = citiesByProvince.get(provinceCode) || [];
  list.push(city);
  citiesByProvince.set(provinceCode, list);
});

rawBarangays.forEach((barangay) => {
  const code = resolveBarangayCode(barangay);
  const cityCode = resolveBarangayCityCode(barangay);
  const nameKey = normalizeLookupValue(resolveBarangayName(barangay));
  if (code) {
    barangaysByCode.set(code, barangay);
  }
  if (cityCode && nameKey) {
    const lookupKey = `${cityCode}::${nameKey}`;
    if (!barangaysByCityAndName.has(lookupKey)) {
      barangaysByCityAndName.set(lookupKey, barangay);
    }
  }
  if (!cityCode) return;
  const list = barangaysByCity.get(cityCode) || [];
  list.push(barangay);
  barangaysByCity.set(cityCode, list);
});

const sortByName = (resolver) => (a, b) => resolver(a).localeCompare(resolver(b));

rawProvinces.sort(sortByName(resolveProvinceName));
for (const [, list] of citiesByProvince) {
  list.sort(sortByName(resolveCityName));
}
for (const [, list] of barangaysByCity) {
  list.sort(sortByName(resolveBarangayName));
}

const provinceOptions = rawProvinces
  .map((province) => ({
    value: resolveProvinceCode(province),
    label: resolveProvinceName(province),
  }))
  .filter((option) => option.value && option.label);

export function resolveProvinceCodeByName(name) {
  const province = provincesByName.get(normalizeLookupValue(name));
  return resolveProvinceCode(province);
}

export function resolveCityCodeByName({ provinceCode, name }) {
  if (!provinceCode || !name) return "";
  const city = citiesByProvinceAndName.get(`${provinceCode}::${normalizeLookupValue(name)}`);
  return resolveCityCode(city);
}

export function resolveBarangayCodeByName({ cityCode, name }) {
  if (!cityCode || !name) return "";
  const barangay = barangaysByCityAndName.get(`${cityCode}::${normalizeLookupValue(name)}`);
  return resolveBarangayCode(barangay);
}

export function useAddress({ value, onChange }) {
  const provinceValue = String(value?.province ?? "");
  const cityValue = String(value?.city ?? "");
  const barangayValue = String(value?.barangay ?? "");

  const resolveInputValue = useCallback((input) => {
    if (!input) return "";
    if (typeof input === "object") {
      if ("target" in input) return input.target.value;
      if ("value" in input) return input.value;
    }
    return String(input);
  }, []);

  const selectedProvince = provincesByCode.get(provinceValue) || null;
  const selectedCity = citiesByCode.get(cityValue) || null;
  const selectedBarangay = barangaysByCode.get(barangayValue) || null;

  const cityOptions = useMemo(() => {
    if (!provinceValue) return [];
    const cities = citiesByProvince.get(provinceValue) || [];
    return cities
      .map((city) => ({
        value: resolveCityCode(city),
        label: resolveCityName(city),
      }))
      .filter((option) => option.value && option.label);
  }, [provinceValue]);

  const barangayOptions = useMemo(() => {
    if (!cityValue) return [];
    const barangays = barangaysByCity.get(cityValue) || [];
    return barangays
      .map((barangay) => ({
        value: resolveBarangayCode(barangay),
        label: resolveBarangayName(barangay),
      }))
      .filter((option) => option.value && option.label);
  }, [cityValue]);

  const postalCode = useMemo(
    () => getPostalCode({ province: provinceValue, city: cityValue }),
    [provinceValue, cityValue]
  );

  useEffect(() => {
    if (!onChange) return;
    if (value?.postalCode !== postalCode) {
      onChange({
        ...value,
        postalCode,
      });
    }
  }, [onChange, postalCode, value]);

  const handleProvinceChange = useCallback(
    (input) => {
      const nextProvince = resolveInputValue(input);
      if (!onChange) return;
      onChange({
        ...value,
        province: nextProvince,
        city: "",
        barangay: "",
        postalCode: nextProvince ? getPostalCode({ province: nextProvince, city: "" }) : "",
      });
    },
    [onChange, resolveInputValue, value]
  );

  const handleCityChange = useCallback(
    (input) => {
      const nextCity = resolveInputValue(input);
      if (!onChange) return;
      onChange({
        ...value,
        city: nextCity,
        barangay: "",
        postalCode: nextCity ? getPostalCode({ province: provinceValue, city: nextCity }) : "",
      });
    },
    [onChange, provinceValue, resolveInputValue, value]
  );

  const handleBarangayChange = useCallback(
    (input) => {
      const nextBarangay = resolveInputValue(input);
      if (!onChange) return;
      onChange({
        ...value,
        barangay: nextBarangay,
      });
    },
    [onChange, resolveInputValue, value]
  );

  return {
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
    isCityDisabled: !provinceValue,
    isBarangayDisabled: !cityValue,
  };
}

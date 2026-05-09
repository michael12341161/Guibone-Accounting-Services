import addressData from "../data/ph-address.json";
import { repairUtf8Mojibake } from "../utils/text_normalization";

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalize = (value) => repairUtf8Mojibake(value).trim().toLowerCase();

const resolveProvinceCode = (province) =>
  String(province?.code ?? province?.province_code ?? province?.provinceCode ?? "");
const resolveProvinceName = (province) =>
  repairUtf8Mojibake(province?.name ?? province?.province_name ?? province?.province ?? "");
const resolveCityCode = (city) => String(city?.code ?? city?.city_code ?? city?.cityCode ?? "");
const resolveCityName = (city) => repairUtf8Mojibake(city?.name ?? city?.city_name ?? city?.city ?? "");
const resolveCityProvinceCode = (city) => String(city?.provinceCode ?? city?.province_code ?? "");

const provinceList = safeArray(addressData?.provinces);
const cityList = safeArray(addressData?.cities);
const postalCodeMap = addressData?.postalCodes || {};

const provincesByCode = new Map();
const provinceCodesByName = new Map();
const citiesByCode = new Map();
const citiesByName = new Map();

provinceList.forEach((province) => {
  const code = resolveProvinceCode(province);
  const name = normalize(resolveProvinceName(province));
  if (code) {
    provincesByCode.set(code, province);
  }
  if (name && !provinceCodesByName.has(name)) {
    provinceCodesByName.set(name, code);
  }
});

cityList.forEach((city) => {
  const code = resolveCityCode(city);
  const name = normalize(resolveCityName(city));
  if (code) {
    citiesByCode.set(code, city);
  }
  if (name) {
    const list = citiesByName.get(name) || [];
    list.push(city);
    citiesByName.set(name, list);
  }
});

const resolvePostalCodeFromCity = (city) =>
  String(city?.postalCode ?? city?.postal_code ?? city?.zip_code ?? city?.zip ?? "");

function resolveProvinceLookupCode(provinceValue) {
  const rawValue = String(provinceValue ?? "").trim();
  if (!rawValue) return "";
  if (provincesByCode.has(rawValue)) return rawValue;
  return provinceCodesByName.get(normalize(rawValue)) || "";
}

export function getPostalCodeByLocation({ province, city, fallback = "" }) {
  const cityValue = String(city ?? "").trim();
  const provinceValue = String(province ?? "").trim();
  const fallbackValue = String(fallback ?? "").trim();

  if (!cityValue) {
    return fallbackValue;
  }

  const cityByCode = citiesByCode.get(cityValue);
  if (cityByCode) {
    const direct = resolvePostalCodeFromCity(cityByCode);
    if (direct) return direct;
  }

  const provinceCode = resolveProvinceLookupCode(provinceValue);
  const normalizedName = normalize(cityValue);
  const candidates = citiesByName.get(normalizedName) || [];
  const candidate =
    candidates.find((item) => resolveCityProvinceCode(item) === provinceCode) || candidates[0];
  if (candidate) {
    const direct = resolvePostalCodeFromCity(candidate);
    if (direct) return direct;
  }

  if (postalCodeMap[cityValue]) {
    return String(postalCodeMap[cityValue]);
  }

  if (postalCodeMap[normalizedName]) {
    return String(postalCodeMap[normalizedName]);
  }

  return fallbackValue;
}

export function getPostalCode({ province, city }) {
  return getPostalCodeByLocation({ province, city });
}

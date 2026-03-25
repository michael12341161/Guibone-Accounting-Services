import addressData from "../data/ph-address.json";
import { repairUtf8Mojibake } from "../utils/text_normalization";

const safeArray = (value) => (Array.isArray(value) ? value : []);

const normalize = (value) => repairUtf8Mojibake(value).trim().toLowerCase();

const resolveCityCode = (city) => String(city?.code ?? city?.city_code ?? city?.cityCode ?? "");
const resolveCityName = (city) => repairUtf8Mojibake(city?.name ?? city?.city_name ?? city?.city ?? "");
const resolveCityProvinceCode = (city) => String(city?.provinceCode ?? city?.province_code ?? "");

const cityList = safeArray(addressData?.cities);
const postalCodeMap = addressData?.postalCodes || {};

const citiesByCode = new Map();
const citiesByName = new Map();

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

export function getPostalCode({ province, city }) {
  const cityValue = String(city ?? "").trim();
  const provinceValue = String(province ?? "").trim();

  if (!cityValue) {
    return "";
  }

  const cityByCode = citiesByCode.get(cityValue);
  if (cityByCode) {
    const direct = resolvePostalCodeFromCity(cityByCode);
    if (direct) return direct;
  }

  const normalizedName = normalize(cityValue);
  const candidates = citiesByName.get(normalizedName) || [];
  const candidate =
    candidates.find((item) => resolveCityProvinceCode(item) === provinceValue) || candidates[0];
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

  return "";
}

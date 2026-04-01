import { getPostalCodeByLocation } from "../services/postalService";
import { repairUtf8Mojibake } from "./text_normalization";

export const PHILIPPINES_MAP_CENTER = [12.8797, 121.774];
export const PHILIPPINES_DEFAULT_MAP_ZOOM = 6;
export const DEFAULT_MAP_ZOOM = 16;
export const MIN_LOCATION_SEARCH_LENGTH = 3;

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

function createLocationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeText(value) {
  return repairUtf8Mojibake(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickFirstValue(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function joinParts(parts, separator = ", ") {
  return parts.map((part) => normalizeText(part)).filter(Boolean).join(separator);
}

function buildStreetAddress(address) {
  const houseNumber = pickFirstValue(address?.house_number, address?.housenumber);
  const streetName = pickFirstValue(
    address?.road,
    address?.street,
    address?.residential,
    address?.pedestrian,
    address?.footway,
    address?.path,
    address?.place
  );
  const building = pickFirstValue(
    address?.building,
    address?.house_name,
    address?.office,
    address?.commercial,
    address?.industrial
  );
  const street = [houseNumber, streetName].filter(Boolean).join(" ").trim();

  return street || building;
}

function extractBarangay(address) {
  return pickFirstValue(
    address?.barangay,
    address?.suburb,
    address?.quarter,
    address?.village,
    address?.hamlet,
    address?.neighbourhood,
    address?.city_district,
    address?.district,
    address?.borough
  );
}

function extractCity(address) {
  return pickFirstValue(
    address?.city,
    address?.town,
    address?.municipality,
    address?.city_district,
    address?.county
  );
}

function extractProvince(address) {
  return pickFirstValue(
    address?.province,
    address?.state,
    address?.region,
    address?.state_district,
    address?.county
  );
}

async function fetchNominatimJson(url, params, options = {}) {
  const { signal } = options;
  const response = await fetch(`${url}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw createLocationError("Unable to load location details right now.", "NETWORK");
  }

  return response.json();
}

export function formatDisplayValue(value, fallback = "-") {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

export function buildBusinessAddress(business) {
  const joinedAddress = [
    business?.business_street_address,
    business?.business_barangay,
    business?.business_municipality,
    business?.business_province,
    business?.business_postal_code,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(", ");

  return formatDisplayValue(business?.business_address || joinedAddress, "No address on file");
}

export function buildBusinessAddressDetails(business) {
  return [
    ["Province", business?.business_province],
    ["Municipality", business?.business_municipality],
    ["Barangay", business?.business_barangay],
    ["Postal Code", business?.business_postal_code],
  ]
    .map(([label, value]) => {
      const normalizedValue = normalizeText(value);
      return normalizedValue ? `${label}: ${normalizedValue}` : "";
    })
    .filter(Boolean);
}

export function buildBusinessSearchQueries(business) {
  const street = normalizeText(business?.business_street_address);
  const barangay = normalizeText(business?.business_barangay);
  const municipality = normalizeText(business?.business_municipality);
  const province = normalizeText(business?.business_province);
  const postalCode = normalizeText(business?.business_postal_code);
  const fullAddress = normalizeText(business?.business_address);

  const createQuery = (...parts) => {
    const filtered = parts.map((part) => String(part ?? "").trim()).filter(Boolean);
    return filtered.length ? [...filtered, "Philippines"].join(", ") : "";
  };

  const barangayLabel = barangay ? `Barangay ${barangay}` : "";
  const deduped = [];
  const seen = new Set();

  [
    createQuery(barangayLabel, municipality, province, postalCode),
    createQuery(barangay, municipality, province, postalCode),
    createQuery(barangayLabel, municipality, province),
    createQuery(barangay, municipality, province),
    createQuery(street, barangayLabel, municipality, province, postalCode),
    createQuery(street, barangay, municipality, province, postalCode),
    createQuery(street, barangayLabel, municipality, province),
    createQuery(street, barangay, municipality, province),
    createQuery(fullAddress),
    createQuery(municipality, province, postalCode),
    createQuery(municipality, province),
    createQuery(province),
  ].forEach((query) => {
    const key = query.toLowerCase();
    if (!query || seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(query);
  });

  return deduped;
}

export function buildInteractiveBusinessSearchQuery(address) {
  return joinParts(
    [
      address?.street,
      address?.barangay,
      address?.city,
      address?.province,
      address?.postalCode,
      "Philippines",
    ],
    ", "
  );
}

export function extractBusinessAddressFromNominatim(result) {
  const address = result?.address || {};
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);
  const countryCode = pickFirstValue(address?.country_code).toLowerCase();

  if (countryCode && countryCode !== "ph") {
    throw createLocationError("Please choose a location within the Philippines.", "OUT_OF_COUNTRY");
  }

  const city = extractCity(address);
  const province = extractProvince(address);
  const postalCode =
    pickFirstValue(address?.postcode) || getPostalCodeByLocation({ province, city });

  return {
    street: buildStreetAddress(address),
    barangay: extractBarangay(address),
    city,
    province,
    postalCode,
    displayName: pickFirstValue(result?.display_name),
    country: "Philippines",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export async function searchPhilippineLocation(query, options = {}) {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < MIN_LOCATION_SEARCH_LENGTH) {
    throw createLocationError(
      `Type at least ${MIN_LOCATION_SEARCH_LENGTH} characters to search for a location.`,
      "QUERY_TOO_SHORT"
    );
  }

  const suggestions = await searchPhilippineLocationSuggestions(normalizedQuery, {
    ...options,
    limit: 1,
  });

  if (!suggestions.length) {
    throw createLocationError(
      "Location not found. Try a more specific street, barangay, city, or province.",
      "NOT_FOUND"
    );
  }

  return suggestions[0];
}

export async function searchPhilippineLocationSuggestions(query, options = {}) {
  const normalizedQuery = normalizeText(query);
  const { limit = 5 } = options;

  if (normalizedQuery.length < MIN_LOCATION_SEARCH_LENGTH) {
    throw createLocationError(
      `Type at least ${MIN_LOCATION_SEARCH_LENGTH} characters to search for a location.`,
      "QUERY_TOO_SHORT"
    );
  }

  const params = new URLSearchParams({
    q: normalizedQuery,
    format: "json",
    countrycodes: "ph",
    limit: String(limit),
    addressdetails: "1",
  });

  const rows = await fetchNominatimJson(NOMINATIM_SEARCH_URL, params, options);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      try {
        return extractBusinessAddressFromNominatim(row);
      } catch (_) {
        return null;
      }
    })
    .filter((location) => Number.isFinite(location?.lat) && Number.isFinite(location?.lng));
}

export async function reverseGeocodePhilippineLocation({ lat, lng }, options = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw createLocationError("The selected map location is invalid.", "INVALID_COORDINATES");
  }

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "json",
    addressdetails: "1",
  });

  const result = await fetchNominatimJson(NOMINATIM_REVERSE_URL, params, options);
  if (!result || typeof result !== "object") {
    throw createLocationError("Unable to determine the address for that map location.", "NOT_FOUND");
  }

  const location = extractBusinessAddressFromNominatim(result);
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return {
      ...location,
      lat: latitude,
      lng: longitude,
    };
  }

  return location;
}

export async function geocodeBusinessAddress(queries, options = {}) {
  const candidates = Array.isArray(queries) ? queries : [queries];
  const normalizedCandidates = candidates.map((query) => normalizeText(query)).filter(Boolean);

  if (!normalizedCandidates.length) {
    throw createLocationError("No business address is available for the map.", "NOT_FOUND");
  }

  let lastNotFoundError = null;

  for (const query of normalizedCandidates) {
    try {
      const location = await searchPhilippineLocation(query, options);
      return {
        lat: location.lat,
        lng: location.lng,
        label: location.displayName || query,
        query,
      };
    } catch (error) {
      if (error?.code === "NOT_FOUND") {
        lastNotFoundError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastNotFoundError || createLocationError("We could not find this business on the map yet.", "NOT_FOUND");
}

const PUBLIC_HOLIDAY_API_BASE = "https://date.nager.at/api/v3/PublicHolidays";
const publicHolidayCache = new Map();

function normalizeHolidayRow(row) {
  const date = String(row?.date || "").slice(0, 10);
  const localName = String(row?.localName || "").trim();
  const englishName = String(row?.name || "").trim();
  const title = localName || englishName || "Holiday";
  const description =
    localName && englishName && localName !== englishName
      ? `${localName} (${englishName})`
      : englishName || localName || "Public holiday";

  return {
    id: `${String(row?.countryCode || "PH")}:${date}:${title}`,
    date,
    title,
    localName: localName || title,
    englishName: englishName || title,
    description,
    countryCode: String(row?.countryCode || "PH"),
    global: Boolean(row?.global),
    types: Array.isArray(row?.types) ? row.types : [],
  };
}

async function fetchPublicHolidaysByYear(year, countryCode = "PH") {
  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1) {
    return [];
  }

  const normalizedCountryCode = String(countryCode || "PH").trim().toUpperCase();
  const cacheKey = `${normalizedCountryCode}:${normalizedYear}`;

  if (!publicHolidayCache.has(cacheKey)) {
    const request = fetch(`${PUBLIC_HOLIDAY_API_BASE}/${normalizedYear}/${normalizedCountryCode}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load public holidays for ${normalizedYear}.`);
        }

        const payload = await response.json();
        return Array.isArray(payload) ? payload.map(normalizeHolidayRow) : [];
      })
      .catch((error) => {
        publicHolidayCache.delete(cacheKey);
        throw error;
      });

    publicHolidayCache.set(cacheKey, request);
  }

  return publicHolidayCache.get(cacheKey);
}

export async function fetchPhilippinePublicHolidays(years) {
  const normalizedYears = [...new Set((Array.isArray(years) ? years : [years])
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year) && year > 0))]
    .sort((left, right) => left - right);

  if (!normalizedYears.length) {
    return [];
  }

  const rows = await Promise.all(normalizedYears.map((year) => fetchPublicHolidaysByYear(year, "PH")));
  return rows.flat();
}

export function getCalendarYearsFromRange(start, end) {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [new Date().getFullYear()];
  }

  const startYear = Math.min(startDate.getFullYear(), endDate.getFullYear());
  const endYear = Math.max(startDate.getFullYear(), endDate.getFullYear());
  const years = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }

  return years;
}

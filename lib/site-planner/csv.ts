import Papa from 'papaparse';
import { CompetitorRecord, StoreRecord, DemographicRecord } from './types';

export interface ParseResult<T> { records: (T & { address?: string })[]; errors: string[]; }

const ALIASES: Record<string, string[]> = {
  name: ['name', 'store', 'store_name', 'location', 'title'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x'],
  address: ['address', 'addr', 'street'],
  brand: ['brand', 'chain'],
  category: ['category', 'type', 'cuisine'],
  store_id: ['store_id', 'id', 'code'],
  monthly_sales: ['monthly_sales', 'sales', 'revenue', 'turnover'],
  format: ['format', 'store_format'],
  suburb: ['suburb', 'area', 'neighbourhood', 'neighborhood'],
  population: ['population', 'pop'],
  income: ['income', 'avg_income', 'median_income'],
  lsm: ['lsm', 'living_standard'],
  households: ['households', 'hh'],
  density: ['density', 'pop_density'],
};

/** Build a map of canonical-field -> actual header present in the file. */
function resolveHeaders(headers: string[]): Record<string, string> {
  const lower = headers.map(h => ({ raw: h, norm: h.trim().toLowerCase() }));
  const out: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    const match = lower.find(h => aliases.includes(h.norm));
    if (match) out[canonical] = match.raw;
  }
  return out;
}

const num = (v: unknown): number => {
  if (v === undefined || v === null || String(v).trim() === '') return NaN;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

function parse<T>(csv: string, build: (row: any, map: Record<string, string>) => { record: T & { address?: string }; rowError?: string }): ParseResult<T> {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const headerMap = resolveHeaders(parsed.meta.fields ?? []);
  const records: (T & { address?: string })[] = [];
  const errors: string[] = [];
  parsed.data.forEach((row, i) => {
    const { record, rowError } = build(row, headerMap);
    if (rowError) errors.push(`row ${i + 1}: ${rowError}`);
    records.push(record);
  });
  return { records, errors };
}

function coords(row: any, map: Record<string, string>) {
  const lat = num(row[map.lat]);
  const lng = num(row[map.lng]);
  const address = map.address ? String(row[map.address] ?? '').trim() : '';
  const missingCoords = Number.isNaN(lat) || Number.isNaN(lng);
  const hasRawCoordText = map.lat && String(row[map.lat] ?? '').trim() !== '';
  let rowError: string | undefined;
  if (missingCoords && !address) {
    rowError = hasRawCoordText ? 'unparseable lat/lng and no address' : 'missing lat/lng and no address';
  }
  return { lat, lng, address: address || undefined, rowError };
}

export function parseCompetitors(csv: string): ParseResult<CompetitorRecord> {
  return parse<CompetitorRecord>(csv, (row, map) => {
    const { lat, lng, address, rowError } = coords(row, map);
    return {
      record: {
        name: String(row[map.name] ?? '').trim() || 'Unnamed',
        lat, lng, address,
        brand: map.brand ? String(row[map.brand] ?? '').trim() || undefined : undefined,
        category: map.category ? String(row[map.category] ?? '').trim() || undefined : undefined,
      },
      rowError,
    };
  });
}

export function parseStores(csv: string): ParseResult<StoreRecord> {
  return parse<StoreRecord>(csv, (row, map) => {
    const { lat, lng, address, rowError } = coords(row, map);
    const sales = map.monthly_sales ? num(row[map.monthly_sales]) : NaN;
    return {
      record: {
        name: String(row[map.name] ?? '').trim() || 'Unnamed',
        lat, lng, address,
        storeId: map.store_id ? String(row[map.store_id] ?? '').trim() || undefined : undefined,
        monthlySales: Number.isNaN(sales) ? undefined : sales,
        format: map.format ? String(row[map.format] ?? '').trim() || undefined : undefined,
      },
      rowError,
    };
  });
}

export function parseDemographics(csv: string): ParseResult<DemographicRecord> {
  return parse<DemographicRecord>(csv, (row, map) => {
    const suburb = String(row[map.suburb] ?? '').trim();
    return {
      record: {
        suburb,
        population: map.population ? num(row[map.population]) || undefined : undefined,
        income: map.income ? num(row[map.income]) || undefined : undefined,
        lsm: map.lsm ? num(row[map.lsm]) || undefined : undefined,
        households: map.households ? num(row[map.households]) || undefined : undefined,
        density: map.density ? num(row[map.density]) || undefined : undefined,
      },
      rowError: suburb ? undefined : 'missing suburb/area name',
    };
  });
}

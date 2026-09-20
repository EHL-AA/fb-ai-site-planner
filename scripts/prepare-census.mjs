#!/usr/bin/env node
// Joins a Stats SA SuperWEB2 ward export with ward centroids into public/data/census-wards.json.
// Usage: node scripts/prepare-census.mjs <wards.csv> <centroids.csv>
//   wards.csv     columns (any order, case-insensitive): ward, population, households   [muni optional]
//   centroids.csv columns: ward, lat, lng, area_km2
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';

const [wardsPath, centroidsPath] = process.argv.slice(2);
if (!wardsPath || !centroidsPath) {
  console.error('Usage: node scripts/prepare-census.mjs <wards.csv> <centroids.csv>');
  process.exit(1);
}
const read = p => Papa.parse(readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() }).data;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

const centroids = new Map(read(centroidsPath).map(r => [String(r.ward).trim(), r]));
const out = [];
let skippedBadCoords = 0;
let defaultedFields = 0;
for (const r of read(wardsPath)) {
  const ward = String(r.ward ?? '').trim();
  const c = centroids.get(ward);
  if (!ward || !c) continue;
  const lat = num(c.lat);
  const lng = num(c.lng);
  if (lat === null || lng === null) {
    skippedBadCoords++;
    continue;
  }
  const population = num(r.population);
  const households = num(r.households);
  const areaKm2 = num(c.area_km2);
  const defaults = [];
  if (population === null) defaults.push('population');
  if (households === null) defaults.push('households');
  if (areaKm2 === null) defaults.push('areaKm2');
  if (defaults.length > 0) {
    console.warn(`ward ${ward}: defaulted ${defaults.join(', ')} to 0`);
    defaultedFields++;
  }
  out.push({ ward, muni: String(r.muni ?? '').trim(), lat, lng, population: population ?? 0, households: households ?? 0, areaKm2: areaKm2 ?? 0 });
}
writeFileSync(new URL('../public/data/census-wards.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.length} wards (${skippedBadCoords} skipped: bad coords; ${defaultedFields} rows with defaulted numeric fields)`);

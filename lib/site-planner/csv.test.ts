import { describe, it, expect } from 'vitest';
import { parseCompetitors, parseStores, parseDemographics } from './csv';

describe('parseCompetitors', () => {
  it('maps standard headers and coerces numbers', () => {
    const csv = 'name,lat,lng,brand\nNandos Rosebank,-26.14,28.04,Nandos\n';
    const { records, errors } = parseCompetitors(csv);
    expect(errors).toHaveLength(0);
    expect(records).toEqual([{ name: 'Nandos Rosebank', lat: -26.14, lng: 28.04, brand: 'Nandos', category: undefined, address: undefined }]);
  });

  it('matches case-insensitive / aliased headers (Latitude/Longitude)', () => {
    const csv = 'Name,Latitude,Longitude\nKFC,-26.2,28.1\n';
    const { records, errors } = parseCompetitors(csv);
    expect(errors).toHaveLength(0);
    expect(records[0]).toMatchObject({ name: 'KFC', lat: -26.2, lng: 28.1 });
  });

  it('reports a per-row error for an unparseable coordinate; keeps all rows (bad row has NaN coords)', () => {
    const csv = 'name,lat,lng\nGood,-26.1,28.0\nBad,abc,28.0\n';
    const { records, errors } = parseCompetitors(csv);
    expect(records).toHaveLength(2);
    expect(records[0].name).toBe('Good');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('row 2');
  });

  it('flags rows missing both coordinates and address for geocoding', () => {
    const csv = 'name,address\nMug & Bean,Shop 5 Mall of Africa\n';
    const { records } = parseCompetitors(csv);
    expect(records[0].lat).toBeNaN();
    expect(records[0].lng).toBeNaN();
    expect(records[0].address).toBe('Shop 5 Mall of Africa');
  });
});

describe('parseStores', () => {
  it('parses optional monthly_sales as a number', () => {
    const csv = 'name,lat,lng,monthly_sales\nSteers CBD,-26.2,28.04,150000\n';
    const { records } = parseStores(csv);
    expect(records[0].monthlySales).toBe(150000);
  });
});

describe('parseDemographics', () => {
  it('maps suburb + numeric fields via aliases', () => {
    const csv = 'area,pop,lsm\nRosebank,42000,9\n';
    const { records, errors } = parseDemographics(csv);
    expect(errors).toHaveLength(0);
    expect(records[0]).toMatchObject({ suburb: 'Rosebank', population: 42000, lsm: 9 });
  });

  it('preserves a legitimate zero value', () => {
    const csv = 'suburb,population,density\nNew Zone,0,0\n';
    const { records } = parseDemographics(csv);
    expect(records[0].population).toBe(0);
    expect(records[0].density).toBe(0);
  });

  it('flags rows missing the suburb name', () => {
    const csv = 'suburb,population\n,1000\n';
    const { errors } = parseDemographics(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('row 1');
  });
});

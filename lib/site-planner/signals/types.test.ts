import { describe, it, expect } from 'vitest';
import { measured, proxy, unavailable, CallBudget } from './types';

describe('signal constructors', () => {
  it('tag provenance and carry source/note', () => {
    expect(measured(5, 'Routes')).toEqual({ value: 5, provenance: 'measured', source: 'Routes', note: undefined });
    expect(proxy(5, 'Reviews', 'n')).toMatchObject({ provenance: 'proxy', note: 'n' });
    expect(unavailable('X', 'off')).toEqual({ value: null, provenance: 'unavailable', source: 'X', note: 'off' });
  });
});

describe('CallBudget', () => {
  it('counts calls per API and refuses past max', () => {
    const b = new CallBudget(2);
    expect(b.take('routes')).toBe(true);
    expect(b.take('aggregate')).toBe(true);
    expect(b.take('routes')).toBe(false);
    expect(b.used).toBe(2);
    expect(b.byApi).toEqual({ routes: 1, aggregate: 1 });
  });
});

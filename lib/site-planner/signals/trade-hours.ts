import { RawPlace } from '../types';
import { SignalSource, TradeHoursSignal, measured, unavailable, clamp100 } from './types';

export const TRADE_HOURS_LABEL = 'Google Places opening hours';
/** Minimum businesses with hours before the share is meaningful. */
const MIN_SAMPLE = 3;
/** Probe: Wednesday 20:00 local. Days are 0 = Sunday … 6 = Saturday. */
const LATE_DAY = 3;
const LATE_MINUTE = 20 * 60;

/** True when any period covers `day` at `minuteOfDay` (handles overnight and 24-hour periods). */
export function isOpenAt(periods: RawPlace['openPeriods'], day: number, minuteOfDay: number): boolean {
  if (!periods?.length) return false;
  for (const p of periods) {
    // 24-hour place: a single period opening Sunday 00:00 with no close.
    if (p.closeDay == null || p.closeMinute == null) return true;
    const start = p.openDay * 1440 + p.openMinute;
    let end = p.closeDay * 1440 + p.closeMinute;
    if (end <= start) end += 7 * 1440; // wraps past Saturday
    const t = day * 1440 + minuteOfDay;
    if ((t >= start && t < end) || (t + 7 * 1440 >= start && t + 7 * 1440 < end)) return true;
  }
  return false;
}

export function isOpenOnDay(periods: RawPlace['openPeriods'], day: number): boolean {
  if (!periods?.length) return false;
  return periods.some(p => p.openDay === day || p.closeDay == null);
}

/** Share of businesses (with hours) open Wed 20:00 and on Sundays, as 0–100. */
export function tradeHours(places: RawPlace[]): TradeHoursSignal | null {
  const withHours = places.filter(p => p.openPeriods && p.openPeriods.length > 0);
  if (withHours.length < MIN_SAMPLE) return null;
  const late = withHours.filter(p => isOpenAt(p.openPeriods, LATE_DAY, LATE_MINUTE)).length;
  const sunday = withHours.filter(p => isOpenOnDay(p.openPeriods, 0)).length;
  return {
    openLate0to100: clamp100((late / withHours.length) * 100),
    openSunday0to100: clamp100((sunday / withHours.length) * 100),
    sample: withHours.length,
  };
}

export const tradeHoursSource: SignalSource<'tradeHours'> = {
  id: 'tradeHours',
  label: TRADE_HOURS_LABEL,
  async enrich(nodes) {
    return nodes.map(node => {
      const v = tradeHours(node.nearby ?? node.places);
      if (!v) return unavailable<TradeHoursSignal>(TRADE_HOURS_LABEL, 'Fewer than 3 nearby businesses publish opening hours.');
      return measured(v, TRADE_HOURS_LABEL, `Share of ${v.sample} nearby businesses open after 20:00 on weekdays and on Sundays.`);
    });
  },
};

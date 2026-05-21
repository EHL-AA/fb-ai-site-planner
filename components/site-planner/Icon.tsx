import React from 'react';

type IconName =
  | 'search' | 'map' | 'pin' | 'layers' | 'filter' | 'sliders' | 'chart' | 'users'
  | 'car' | 'walk' | 'store' | 'sparkle' | 'send' | 'chevron' | 'chevrond' | 'close'
  | 'plus' | 'check' | 'star' | 'bookmark' | 'compare' | 'download' | 'settings'
  | 'trend' | 'coin' | 'info' | 'grid' | 'list' | 'bolt' | 'target' | 'expand'
  | 'crosshair' | 'polygon' | 'refresh' | 'warning';

const PATHS: Record<IconName, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  filter: <><path d="M4 5h16l-6 8v6l-4 2v-8L4 5Z" /></>,
  sliders: <><path d="M4 7h10" /><path d="M18 7h2" /><path d="M4 17h4" /><path d="M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  chart: <><path d="M4 4v16h16" /><path d="m8 14 3-4 3 3 4-6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="8" r="3" /><path d="M21 19c0-2.5-1.8-4.5-4-5" /></>,
  car: <><path d="M5 14h14l-2-6H7l-2 6Z" /><path d="M3 14v4h2" /><path d="M19 14v4h2" /><circle cx="8" cy="17" r="1.5" /><circle cx="16" cy="17" r="1.5" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="m9 21 2-5-2-4 4-3 3 4 3 1" /><path d="m6 15 3-2" /></>,
  store: <><path d="M3 9 5 4h14l2 5" /><path d="M3 9v11h18V9" /><path d="M3 9h18" /><path d="M9 20v-7h6v7" /></>,
  sparkle: <><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m6 6 2 2" /><path d="m16 16 2 2" /><path d="m6 18 2-2" /><path d="m16 8 2-2" /></>,
  send: <><path d="m4 12 16-8-6 18-3-7-7-3Z" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  chevrond: <><path d="m6 9 6 6 6-6" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  check: <><path d="m5 12 5 5L20 7" /></>,
  star: <><path d="m12 3 2.7 6 6.3.6-4.8 4.4 1.4 6.5L12 17l-5.6 3.5 1.4-6.5L3 9.6 9.3 9 12 3Z" /></>,
  bookmark: <><path d="M6 4h12v17l-6-4-6 4V4Z" /></>,
  compare: <><path d="M4 5h6v14H4z" /><path d="M14 5h6v14h-6z" /></>,
  download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 7v10" /><path d="M15 9.5C15 8 13.7 7 12 7s-3 1-3 2.5 1.3 2 3 2.5c1.7.5 3 1 3 2.5S13.7 17 12 17s-3-1-3-2.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8.5v.01" /><path d="M11 12h1v5h1" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  bolt: <><path d="m13 3-9 11h7l-1 7 9-11h-7l1-7Z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>,
  expand: <><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></>,
  crosshair: <><circle cx="12" cy="12" r="9" /><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /></>,
  polygon: <><path d="m12 3 9 6-3.5 11h-11L3 9l9-6Z" /></>,
  refresh: <><path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6" /><path d="M20 12a8 8 0 0 1-14 5l-2 2v-6h6" /></>,
  warning: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><path d="M12 17v.01" /></>,
};

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'stroke'> {
  name: IconName;
  size?: number;
  stroke?: number;
}

export default function Icon({ name, size = 16, stroke = 1.75, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Recognisable brand colours for the major chains in the bundled data, so
 *  "show all KFCs" plots KFC-red pins. Brands not listed use the query palette.
 *  Keys are lowercased brand names as they appear in the datasets. */
export interface BrandColor { color: string; name: string; }

const BRAND_COLORS: Record<string, BrandColor> = {
  // Fast food / restaurants
  'kfc':            { color: '#e4002b', name: 'KFC red' },
  "mcdonald's":     { color: '#ffc72c', name: "McDonald's yellow" },
  'burger king':    { color: '#f58220', name: 'Burger King orange' },
  'nandos':         { color: '#1f1f1f', name: "Nando's black" },
  'starbucks':      { color: '#00704a', name: 'Starbucks green' },
  'kauai':          { color: '#8dc63f', name: 'Kauai green' },
  'ocean basket':   { color: '#0b4f8a', name: 'Ocean Basket blue' },
  'spur':           { color: '#7b2d26', name: 'Spur maroon' },
  'rocomamas':      { color: '#2a2a2a', name: 'RocoMamas black' },
  'krispy kreme':   { color: '#00653a', name: 'Krispy Kreme green' },
  // Retail anchors
  'shoprite':       { color: '#e5222e', name: 'Shoprite red' },
  'checkers':       { color: '#00a651', name: 'Checkers green' },
  'pick n pay':     { color: '#003da5', name: 'Pick n Pay blue' },
  'spar':           { color: '#009a44', name: 'Spar green' },
  'woolworths':     { color: '#111111', name: 'Woolworths black' },
  'boxer':          { color: '#c8102e', name: 'Boxer red' },
};

export function brandColor(brand: string | null | undefined): BrandColor | null {
  if (!brand) return null;
  return BRAND_COLORS[brand.trim().toLowerCase()] ?? null;
}

/** Dark text on light pins (yellow, lime), white on everything else. */
export function glyphColorFor(background: string): string {
  const hex = background.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1a1208' : '#ffffff';
}

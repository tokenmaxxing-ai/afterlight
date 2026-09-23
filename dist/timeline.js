export const YEAR_NOW = 2026;
export const END_YEAR = 1_000_000_000;
export const KNOTS = [[0, 0], [.14, 74], [.30, 100_000_000], [.47, 250_000_000], [.73, 600_000_000], [1, END_YEAR]];
const POPULATION = [[2026, 8.300678396], [2030, 8.569124911], [2050, 9.664378587], [2085, 10.3], [2100, 10.2]];
export const clamp = (v, low = 0, high = 1) => Math.max(low, Math.min(high, v));
function interpolate(value, pairs) {
  for (let i = 1; i < pairs.length; i++) {
    const [x1, y1] = pairs[i - 1], [x2, y2] = pairs[i];
    if (value <= x2) return y1 + (y2 - y1) * clamp((value - x1) / (x2 - x1));
  }
  return pairs.at(-1)[1];
}
export const yearsAt = (position) => Math.round(interpolate(clamp(position), KNOTS));
export const positionAt = (years) => interpolate(clamp(years, 0, END_YEAR), KNOTS.map(([p, y]) => [y, p]));
export function populationAt(years) {
  if (years > 74) return null;
  return interpolate(YEAR_NOW + years, POPULATION);
}
export function planetAt(years, scenario = 'earlier', finale = 0) {
  const progress = clamp(years / END_YEAR);
  const later = scenario === 'longer';
  return { progress, aridity: Math.pow(progress, .78) * (later ? .45 : .86), iceLoss: progress * .86,
    solar: progress, tectonics: progress, oxygenLoss: Math.pow(progress, 3) * (later ? .16 : .75), finale };
}

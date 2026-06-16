export function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function pct(part, whole) {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

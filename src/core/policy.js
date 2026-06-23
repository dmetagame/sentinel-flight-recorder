export const DEFAULT_POLICY = Object.freeze({
  mode: "paper",
  portfolio: {
    maxDailyLossPct: 3,
    maxTotalExposurePct: 120,
    maxConsecutiveLosses: 3
  },
  trade: {
    maxRiskPct: 1,
    maxLeverage: 5,
    requireStopLoss: true,
    defaultStopLossPct: 2,
    maxSlippageBps: 20,
    allowAutoResize: true,
    allowAutoStopLoss: true,
    allowedSides: ["buy", "sell"],
    maxPriceDeviationBps: 50
  },
  data: {
    maxAgeMs: 15_000
  },
  security: {
    allowTransfers: false,
    duplicateWindowMs: 60_000
  },
  allowedSymbols: ["BTCUSDT", "ETHUSDT"]
});

export function mergePolicy(overrides = {}) {
  return normalizePolicy(deepMerge(DEFAULT_POLICY, overrides));
}

export function normalizePolicy(policy = {}) {
  const portfolio = objectOrEmpty(policy.portfolio);
  const trade = objectOrEmpty(policy.trade);
  const data = objectOrEmpty(policy.data);
  const security = objectOrEmpty(policy.security);
  return {
    mode: typeof policy.mode === "string" ? policy.mode : "paper",
    portfolio: {
      maxDailyLossPct: positiveNumber(portfolio.maxDailyLossPct, DEFAULT_POLICY.portfolio.maxDailyLossPct),
      maxTotalExposurePct: positiveNumber(portfolio.maxTotalExposurePct, DEFAULT_POLICY.portfolio.maxTotalExposurePct),
      maxConsecutiveLosses: positiveInteger(portfolio.maxConsecutiveLosses, DEFAULT_POLICY.portfolio.maxConsecutiveLosses)
    },
    trade: {
      maxRiskPct: positiveNumber(trade.maxRiskPct, DEFAULT_POLICY.trade.maxRiskPct),
      maxLeverage: positiveNumber(trade.maxLeverage, DEFAULT_POLICY.trade.maxLeverage),
      requireStopLoss: booleanValue(trade.requireStopLoss, DEFAULT_POLICY.trade.requireStopLoss),
      defaultStopLossPct: positiveNumber(trade.defaultStopLossPct, DEFAULT_POLICY.trade.defaultStopLossPct),
      maxSlippageBps: nonNegativeNumber(trade.maxSlippageBps, DEFAULT_POLICY.trade.maxSlippageBps),
      allowAutoResize: booleanValue(trade.allowAutoResize, DEFAULT_POLICY.trade.allowAutoResize),
      allowAutoStopLoss: booleanValue(trade.allowAutoStopLoss, DEFAULT_POLICY.trade.allowAutoStopLoss),
      allowedSides: normalizeSides(trade.allowedSides),
      maxPriceDeviationBps: nonNegativeNumber(trade.maxPriceDeviationBps, DEFAULT_POLICY.trade.maxPriceDeviationBps)
    },
    data: {
      maxAgeMs: positiveInteger(data.maxAgeMs, DEFAULT_POLICY.data.maxAgeMs)
    },
    security: {
      allowTransfers: booleanValue(security.allowTransfers, DEFAULT_POLICY.security.allowTransfers),
      duplicateWindowMs: positiveInteger(security.duplicateWindowMs, DEFAULT_POLICY.security.duplicateWindowMs)
    },
    allowedSymbols: normalizeSymbols(policy.allowedSymbols)
  };
}

function deepMerge(base, overrides) {
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(base[key] ?? {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSides(value) {
  if (!Array.isArray(value)) return [...DEFAULT_POLICY.trade.allowedSides];
  const sides = [...new Set(value.filter((side) => side === "buy" || side === "sell"))];
  return sides.length || value.length === 0 ? sides : [...DEFAULT_POLICY.trade.allowedSides];
}

function normalizeSymbols(value) {
  if (!Array.isArray(value)) return [...DEFAULT_POLICY.allowedSymbols];
  return [...new Set(value
    .filter((symbol) => typeof symbol === "string" && /^[A-Z0-9_-]{2,30}$/i.test(symbol))
    .map((symbol) => symbol.toUpperCase()))];
}

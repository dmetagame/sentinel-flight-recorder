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

export function normalizePolicy(policy) {
  return {
    ...policy,
    mode: policy.mode ?? "paper",
    portfolio: {
      ...DEFAULT_POLICY.portfolio,
      ...(policy.portfolio ?? {})
    },
    trade: {
      ...DEFAULT_POLICY.trade,
      ...(policy.trade ?? {})
    },
    data: {
      ...DEFAULT_POLICY.data,
      ...(policy.data ?? {})
    },
    security: {
      ...DEFAULT_POLICY.security,
      ...(policy.security ?? {})
    },
    allowedSymbols: [...new Set(policy.allowedSymbols ?? [])]
  };
}

function deepMerge(base, overrides) {
  const output = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = deepMerge(base[key] ?? {}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

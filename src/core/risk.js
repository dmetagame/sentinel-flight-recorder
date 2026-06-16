import { pct, round } from "./math.js";
import { totalExposureUsd } from "./state.js";

const EXECUTION_TYPES = new Set([
  "place_order",
  "modify_order",
  "set_leverage",
  "transfer",
  "withdraw"
]);

export function evaluateIntent(intent, policy, state, now = Date.now()) {
  const normalized = normalizeIntent(intent);
  const violations = [];
  const modifications = [];
  let nextIntent = { ...normalized };

  if (!EXECUTION_TYPES.has(normalized.type)) {
    return decision("allow", nextIntent, violations, modifications, "Read-only or unknown-safe call.");
  }

  if (normalized.type === "transfer" || normalized.type === "withdraw") {
    if (!policy.security.allowTransfers) {
      violations.push({
        code: "TRANSFER_BLOCKED",
        severity: "critical",
        message: "Transfers and withdrawals are disabled by Sentinel policy."
      });
      return decision("block", nextIntent, violations, modifications);
    }
  }

  if (normalized.type === "set_leverage") {
    return evaluateLeverageIntent(nextIntent, policy, violations, modifications);
  }

  if (normalized.type !== "place_order" && normalized.type !== "modify_order") {
    return decision("allow", nextIntent, violations, modifications);
  }

  if (!nextIntent.symbol) {
    violations.push({
      code: "SYMBOL_REQUIRED",
      severity: "high",
      message: "Execution intents must include a symbol."
    });
  }

  if (!Number.isFinite(Number(nextIntent.price)) || Number(nextIntent.price) <= 0) {
    violations.push({
      code: "PRICE_REQUIRED",
      severity: "high",
      message: "Execution intents must include a positive price."
    });
  }

  if (!Number.isFinite(Number(nextIntent.size)) || Number(nextIntent.size) <= 0) {
    violations.push({
      code: "SIZE_REQUIRED",
      severity: "high",
      message: "Execution intents must include a positive size."
    });
  }

  if (policy.allowedSymbols.length && !policy.allowedSymbols.includes(nextIntent.symbol)) {
    violations.push({
      code: "SYMBOL_NOT_ALLOWED",
      severity: "high",
      message: `${nextIntent.symbol} is not in the policy allowlist.`
    });
  }

  const dailyLossPct = pct(Math.max(0, -state.day.realizedPnlUsd), state.account.equityUsd);
  if (dailyLossPct >= policy.portfolio.maxDailyLossPct) {
    violations.push({
      code: "DAILY_LOSS_CIRCUIT_BREAKER",
      severity: "critical",
      message: `Daily realized loss is ${round(dailyLossPct, 2)}%, above the ${policy.portfolio.maxDailyLossPct}% limit.`
    });
  }

  if (state.day.consecutiveLosses >= policy.portfolio.maxConsecutiveLosses) {
    violations.push({
      code: "CONSECUTIVE_LOSS_COOLDOWN",
      severity: "high",
      message: `${state.day.consecutiveLosses} consecutive losses reached the ${policy.portfolio.maxConsecutiveLosses}-loss cooldown.`
    });
  }

  if (policy.trade.allowedSides?.length && !policy.trade.allowedSides.includes(nextIntent.side)) {
    violations.push({
      code: "SIDE_NOT_ALLOWED",
      severity: "high",
      message: `Side ${nextIntent.side} is not allowed by policy.`
    });
  }

  if (Number(nextIntent.leverage ?? 1) > policy.trade.maxLeverage) {
    if (policy.trade.allowAutoResize) {
      modifications.push({
        code: "LEVERAGE_CAPPED",
        from: nextIntent.leverage,
        to: policy.trade.maxLeverage,
        message: `Leverage capped at ${policy.trade.maxLeverage}x.`
      });
      nextIntent.leverage = policy.trade.maxLeverage;
    } else {
      violations.push({
        code: "LEVERAGE_TOO_HIGH",
        severity: "high",
        message: `Requested leverage ${nextIntent.leverage}x exceeds ${policy.trade.maxLeverage}x.`
      });
    }
  }

  const marketTimestamp = nextIntent.market?.timestamp;
  if (marketTimestamp && now - marketTimestamp > policy.data.maxAgeMs) {
    violations.push({
      code: "STALE_MARKET_DATA",
      severity: "high",
      message: `Market data is ${now - marketTimestamp}ms old; max allowed age is ${policy.data.maxAgeMs}ms.`
    });
  }

  const slippage = Number(nextIntent.expectedSlippageBps ?? 0);
  if (slippage > policy.trade.maxSlippageBps) {
    violations.push({
      code: "SLIPPAGE_TOO_HIGH",
      severity: "high",
      message: `Expected slippage ${slippage} bps exceeds ${policy.trade.maxSlippageBps} bps.`
    });
  }

  const marketPrice = Number(nextIntent.market?.markPrice ?? nextIntent.market?.lastPrice ?? 0);
  if (marketPrice > 0 && Number(nextIntent.price) > 0) {
    const deviationBps = Math.abs((Number(nextIntent.price) - marketPrice) / marketPrice) * 10_000;
    if (deviationBps > policy.trade.maxPriceDeviationBps) {
      violations.push({
        code: "PRICE_DEVIATION_TOO_HIGH",
        severity: "high",
        message: `Order price is ${round(deviationBps, 2)} bps away from market; max allowed is ${policy.trade.maxPriceDeviationBps} bps.`
      });
    }
  }

  if (policy.trade.requireStopLoss && !nextIntent.stopLossPrice) {
    if (policy.trade.allowAutoStopLoss) {
      const stopLossPrice = deriveStopLoss(nextIntent, policy);
      modifications.push({
        code: "STOP_LOSS_ATTACHED",
        from: null,
        to: stopLossPrice,
        message: "Missing stop loss repaired using policy default distance."
      });
      nextIntent.stopLossPrice = stopLossPrice;
    } else {
      violations.push({
        code: "STOP_LOSS_REQUIRED",
        severity: "high",
        message: "Policy requires a stop loss for every order."
      });
    }
  }

  const risk = calculateTradeRisk(nextIntent, state);
  nextIntent.risk = risk;

  if (risk.riskPct > policy.trade.maxRiskPct) {
    if (policy.trade.allowAutoResize && risk.priceDistance > 0) {
      const maxRiskUsd = (state.account.equityUsd * policy.trade.maxRiskPct) / 100;
      const resizedSize = round(maxRiskUsd / risk.priceDistance, 8);
      const resizedNotional = round(resizedSize * risk.entryPrice, 2);

      modifications.push({
        code: "POSITION_RESIZED",
        from: {
          size: nextIntent.size,
          notionalUsd: nextIntent.notionalUsd,
          riskPct: round(risk.riskPct, 3)
        },
        to: {
          size: resizedSize,
          notionalUsd: resizedNotional,
          riskPct: policy.trade.maxRiskPct
        },
        message: `Position resized to respect ${policy.trade.maxRiskPct}% max risk.`
      });

      nextIntent.size = resizedSize;
      nextIntent.notionalUsd = resizedNotional;
      nextIntent.risk = calculateTradeRisk(nextIntent, state);
    } else {
      violations.push({
        code: "TRADE_RISK_TOO_HIGH",
        severity: "high",
        message: `Trade risk ${round(risk.riskPct, 2)}% exceeds ${policy.trade.maxRiskPct}%.`
      });
    }
  }

  const futureExposurePct = pct(
    totalExposureUsd(state) + Math.abs(Number(nextIntent.notionalUsd ?? 0)),
    state.account.equityUsd
  );
  if (futureExposurePct > policy.portfolio.maxTotalExposurePct) {
    violations.push({
      code: "PORTFOLIO_EXPOSURE_TOO_HIGH",
      severity: "high",
      message: `Projected exposure ${round(futureExposurePct, 2)}% exceeds ${policy.portfolio.maxTotalExposurePct}%.`
    });
  }

  if (violations.some((item) => item.severity === "critical" || item.severity === "high")) {
    return decision("block", nextIntent, violations, modifications);
  }

  if (modifications.length) {
    return decision("modify", nextIntent, violations, modifications);
  }

  return decision("allow", nextIntent, violations, modifications);
}

function evaluateLeverageIntent(intent, policy, violations, modifications) {
  if (Number(intent.leverage ?? 1) > policy.trade.maxLeverage) {
    violations.push({
      code: "LEVERAGE_CHANGE_BLOCKED",
      severity: "high",
      message: `Leverage change to ${intent.leverage}x exceeds ${policy.trade.maxLeverage}x.`
    });
    return decision("block", intent, violations, modifications);
  }

  return decision("allow", intent, violations, modifications);
}

function normalizeIntent(intent) {
  const price = Number(intent.price ?? intent.market?.markPrice ?? intent.market?.lastPrice ?? 0);
  const size = Number(intent.size ?? 0);
  const notionalUsd = Number(intent.notionalUsd ?? size * price);

  return {
    ...intent,
    type: intent.type ?? "place_order",
    side: intent.side ?? "buy",
    orderType: intent.orderType ?? "market",
    leverage: Number(intent.leverage ?? 1),
    price,
    size,
    notionalUsd
  };
}

function deriveStopLoss(intent, policy) {
  const price = Number(intent.price);
  const distance = price * (policy.trade.defaultStopLossPct / 100);
  const side = intent.side === "sell" || intent.side === "short" ? "short" : "long";
  return round(side === "long" ? price - distance : price + distance, 2);
}

function calculateTradeRisk(intent, state) {
  const entryPrice = Number(intent.price);
  const stopLossPrice = Number(intent.stopLossPrice);
  const size = Number(intent.size);

  if (!entryPrice || !stopLossPrice || !size) {
    return {
      riskUsd: 0,
      riskPct: 0,
      entryPrice,
      stopLossPrice,
      priceDistance: 0
    };
  }

  const priceDistance = Math.abs(entryPrice - stopLossPrice);
  const riskUsd = priceDistance * size;
  return {
    riskUsd: round(riskUsd, 2),
    riskPct: round(pct(riskUsd, state.account.equityUsd), 4),
    entryPrice,
    stopLossPrice,
    priceDistance
  };
}

function decision(verdict, intent, violations, modifications, note = "") {
  return {
    verdict,
    intent,
    violations,
    modifications,
    note
  };
}

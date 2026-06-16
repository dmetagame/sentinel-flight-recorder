import { createHash } from "node:crypto";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function sha256(value) {
  const input = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(input).digest("hex");
}

export function tradeFingerprint(intent) {
  const material = {
    tool: intent.tool ?? intent.type,
    symbol: intent.symbol,
    side: intent.side,
    orderType: intent.orderType,
    size: intent.size,
    notionalUsd: intent.notionalUsd,
    price: intent.price,
    stopLossPrice: intent.stopLossPrice,
    takeProfitPrice: intent.takeProfitPrice,
    leverage: intent.leverage
  };

  return sha256(material);
}

const WRITE_TOOLS = new Set([
  "futures_place_order",
  "futures_modify_order",
  "futures_set_leverage",
  "spot_place_order",
  "account_transfer",
  "transfer",
  "withdraw"
]);

export function isExecutionTool(toolName) {
  return WRITE_TOOLS.has(toolName);
}

export function toolCallToIntent(toolCall, { readOnly = false } = {}) {
  const args = toolCall.arguments ?? {};

  if (readOnly) {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "read"
    };
  }

  if (toolCall.name === "futures_place_order" || toolCall.name === "spot_place_order") {
    if (Array.isArray(args.orders) && args.orders.length !== 1) {
      return unsupportedWriteIntent(toolCall, "BATCH_ORDER_UNSUPPORTED", "Sentinel requires exactly one order per guarded call.");
    }
    const order = Array.isArray(args.orders) ? args.orders[0] : args;
    if (!order) {
      return unsupportedWriteIntent(toolCall, "BATCH_ORDER_UNSUPPORTED", "Sentinel requires exactly one order per guarded call.");
    }
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "place_order",
      symbol: order.symbol,
      side: normalizeSide(order.side),
      orderType: order.orderType,
      size: Number(order.size ?? order.quantity ?? 0),
      price: Number(order.price ?? order.market?.markPrice ?? 0),
      stopLossPrice: numberOrUndefined(order.stopLossPrice ?? order.presetStopLossPrice),
      takeProfitPrice: numberOrUndefined(order.takeProfitPrice ?? order.presetStopSurplusPrice),
      leverage: Number(order.leverage ?? args.leverage ?? 1),
      expectedSlippageBps: numberOrUndefined(order.expectedSlippageBps),
      market: order.market ?? order._sentinel?.market ?? toolCall.context?.market,
      supportsAttachedStopLoss: toolCall.name === "futures_place_order"
    };
  }

  if (toolCall.name === "futures_modify_order") {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "modify_order",
      symbol: args.symbol,
      side: normalizeSide(args.side ?? args._sentinel?.side ?? toolCall.context?.side),
      orderType: args.orderType,
      size: Number(args.newSize ?? args.size ?? 0),
      price: Number(args.newPrice ?? args.price ?? args.market?.markPrice ?? 0),
      stopLossPrice: numberOrUndefined(args.newPresetStopLossPrice ?? args.stopLossPrice),
      takeProfitPrice: numberOrUndefined(args.newPresetStopSurplusPrice ?? args.takeProfitPrice),
      leverage: Number(args.leverage ?? 1),
      market: args.market ?? args._sentinel?.market ?? toolCall.context?.market,
      supportsAttachedStopLoss: true
    };
  }

  if (toolCall.name === "futures_set_leverage") {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "set_leverage",
      symbol: args.symbol,
      leverage: Number(args.leverage ?? 1)
    };
  }

  if (toolCall.name === "account_transfer" || toolCall.name === "transfer") {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "transfer",
      asset: args.asset ?? args.coin,
      amount: Number(args.amount ?? 0)
    };
  }

  if (toolCall.name === "withdraw") {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "withdraw",
      asset: args.asset ?? args.coin,
      amount: Number(args.amount ?? 0),
      address: args.address
    };
  }

  return unsupportedWriteIntent(toolCall);
}

export async function guardedToolCall(gate, toolCall, nextTool = mockNextTool, options = {}) {
  const intent = toolCallToIntent(toolCall, options);
  const result = await gate.handle(intent);

  if (result.decision.verdict === "block") {
    return {
      ok: false,
      blocked: true,
      sentinel: result
    };
  }

  const rewrittenToolCall = intentToToolCall(toolCall, result.decision.intent);
  return {
    ok: true,
    blocked: false,
    modified: result.decision.verdict === "modify",
    sentinel: result,
    upstream: await nextTool(rewrittenToolCall)
  };
}

function intentToToolCall(original, intent) {
  if (original.name === "futures_place_order" || original.name === "spot_place_order") {
    const sourceOrder = Array.isArray(original.arguments?.orders)
      ? original.arguments.orders[0]
      : original.arguments ?? {};
    const {
      market,
      expectedSlippageBps,
      leverage,
      _sentinel,
      presetStopLossPrice,
      presetStopSurplusPrice,
      ...upstreamOrder
    } = sourceOrder;
    void market;
    void expectedSlippageBps;
    void leverage;
    void _sentinel;
    void presetStopLossPrice;
    void presetStopSurplusPrice;

    return {
      ...original,
      arguments: {
        orders: [
          {
            ...upstreamOrder,
            size: String(intent.size),
            price: String(intent.price),
            ...(original.name === "futures_place_order"
              ? {
                  presetStopLossPrice: intent.stopLossPrice ? String(intent.stopLossPrice) : undefined,
                  presetStopSurplusPrice: intent.takeProfitPrice ? String(intent.takeProfitPrice) : undefined
                }
              : {})
          }
        ]
      }
    };
  }

  if (original.name === "futures_modify_order") {
    const { market, expectedSlippageBps, leverage, side, _sentinel, ...upstreamArguments } = original.arguments ?? {};
    void market;
    void expectedSlippageBps;
    void leverage;
    void side;
    void _sentinel;
    return {
      ...original,
      arguments: {
        ...upstreamArguments,
        newSize: String(intent.size),
        newPrice: String(intent.price),
        newPresetStopLossPrice: intent.stopLossPrice ? String(intent.stopLossPrice) : undefined,
        newPresetStopSurplusPrice: intent.takeProfitPrice ? String(intent.takeProfitPrice) : undefined
      }
    };
  }

  return original;
}

async function mockNextTool(toolCall) {
  return {
    status: "mocked-upstream-call",
    tool: toolCall.name,
    arguments: toolCall.arguments
  };
}

function normalizeSide(side) {
  if (side === "buy" || side === "long" || side === "open_long" || side === "close_short") return "buy";
  if (side === "sell" || side === "short" || side === "open_short" || side === "close_long") return "sell";
  return side;
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function unsupportedWriteIntent(toolCall, reasonCode, reason) {
  return {
    id: toolCall.id,
    agentId: toolCall.agentId,
    tool: toolCall.name,
    type: "unsupported_write",
    reasonCode,
    reason
  };
}

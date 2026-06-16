const WRITE_TOOLS = new Set([
  "futures_place_order",
  "futures_modify_order",
  "futures_set_leverage",
  "spot_place_order",
  "account_transfer",
  "withdraw"
]);

export function isExecutionTool(toolName) {
  return WRITE_TOOLS.has(toolName);
}

export function toolCallToIntent(toolCall) {
  const args = toolCall.arguments ?? {};

  if (toolCall.name === "futures_place_order" || toolCall.name === "spot_place_order") {
    const order = Array.isArray(args.orders) ? args.orders[0] : args;
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
      market: order.market
    };
  }

  if (toolCall.name === "futures_modify_order") {
    return {
      id: toolCall.id,
      agentId: toolCall.agentId,
      tool: toolCall.name,
      type: "modify_order",
      symbol: args.symbol,
      side: normalizeSide(args.side),
      orderType: args.orderType,
      size: Number(args.newSize ?? args.size ?? 0),
      price: Number(args.newPrice ?? args.price ?? args.market?.markPrice ?? 0),
      stopLossPrice: numberOrUndefined(args.newPresetStopLossPrice ?? args.stopLossPrice),
      takeProfitPrice: numberOrUndefined(args.newPresetStopSurplusPrice ?? args.takeProfitPrice),
      leverage: Number(args.leverage ?? 1),
      market: args.market
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

  if (toolCall.name === "account_transfer") {
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

  return {
    id: toolCall.id,
    agentId: toolCall.agentId,
    tool: toolCall.name,
    type: "read"
  };
}

export async function guardedToolCall(gate, toolCall, nextTool = mockNextTool) {
  if (!isExecutionTool(toolCall.name)) {
    return nextTool(toolCall);
  }

  const intent = toolCallToIntent(toolCall);
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
    return {
      ...original,
      arguments: {
        ...original.arguments,
        orders: [
          {
            ...(Array.isArray(original.arguments?.orders) ? original.arguments.orders[0] : original.arguments),
            size: String(intent.size),
            price: String(intent.price),
            leverage: String(intent.leverage),
            presetStopLossPrice: intent.stopLossPrice ? String(intent.stopLossPrice) : undefined,
            presetStopSurplusPrice: intent.takeProfitPrice ? String(intent.takeProfitPrice) : undefined
          }
        ]
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
  if (side === "sell" || side === "short" || side === "close_short") return "sell";
  return "buy";
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

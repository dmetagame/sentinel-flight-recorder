export function localToolList() {
  return [
    {
      name: "futures_place_order",
      description: "Sentinel-guarded Bitget futures order placement.",
      inputSchema: orderSchema()
    },
    {
      name: "spot_place_order",
      description: "Sentinel-guarded Bitget spot order placement.",
      inputSchema: orderSchema()
    },
    {
      name: "futures_modify_order",
      description: "Sentinel-guarded Bitget futures order modification.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          newSize: { type: "string" },
          newPrice: { type: "string" },
          newPresetStopLossPrice: { type: "string" },
          newPresetStopSurplusPrice: { type: "string" }
        }
      }
    },
    {
      name: "futures_set_leverage",
      description: "Sentinel-guarded futures leverage change.",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          leverage: { type: "number" }
        },
        required: ["symbol", "leverage"]
      }
    },
    {
      name: "transfer",
      description: "Account transfer. Blocked by default Sentinel policy.",
      inputSchema: {
        type: "object",
        properties: {
          coin: { type: "string" },
          amount: { type: "string" }
        },
        required: ["coin", "amount"]
      }
    }
  ];
}

function orderSchema() {
  return {
    type: "object",
    properties: {
      orders: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            side: { type: "string" },
            orderType: { type: "string" },
            size: { type: "string" },
            price: { type: "string" },
            presetStopLossPrice: { type: "string" },
            presetStopSurplusPrice: { type: "string" },
            leverage: { type: "string" }
          }
        }
      }
    },
    required: ["orders"]
  };
}

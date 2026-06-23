import { randomUUID } from "node:crypto";
import { round } from "../core/math.js";

export class PaperExecutor {
  constructor({ state, now = () => Date.now(), idFactory = () => randomUUID() }) {
    this.state = state;
    this.now = now;
    this.idFactory = idFactory;
    this.sequence = 0;
  }

  async execute(intent) {
    if (intent.type !== "place_order" && intent.type !== "modify_order") {
      return {
        status: "noop",
        message: "Intent did not require paper execution."
      };
    }

    this.sequence += 1;
    const orderId = `paper_${this.idFactory(intent, this.sequence)}`;
    const position = {
      orderId,
      symbol: intent.symbol,
      side: intent.side,
      size: Number(intent.size),
      entryPrice: Number(intent.price),
      notionalUsd: round(Number(intent.notionalUsd), 2),
      leverage: Number(intent.leverage ?? 1),
      stopLossPrice: intent.stopLossPrice,
      takeProfitPrice: intent.takeProfitPrice,
      openedAt: new Date(this.now()).toISOString()
    };

    this.state.positions.push(position);

    return {
      status: "filled",
      venue: "paper",
      orderId,
      filledSize: position.size,
      avgFillPrice: position.entryPrice,
      notionalUsd: position.notionalUsd,
      position
    };
  }
}

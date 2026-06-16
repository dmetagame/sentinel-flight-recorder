import { mergePolicy } from "./policy.js";
import { createInitialState } from "./state.js";
import { evaluateIntent } from "./risk.js";
import { tradeFingerprint } from "./hash.js";
import { createReceipt } from "./audit.js";
import { PaperExecutor } from "../adapters/paper-executor.js";

export class SentinelGate {
  constructor({ policy = {}, state = createInitialState(), executor, now } = {}) {
    this.policy = mergePolicy(policy);
    this.state = state;
    this.now = now ?? (() => Date.now());
    this.executor = executor ?? new PaperExecutor({ state: this.state });
    this.receipts = [];
  }

  async handle(intent) {
    const now = this.now();
    const duplicate = this.checkDuplicate(intent, now);
    if (duplicate) {
      const decision = {
        verdict: "block",
        intent,
        violations: [
          {
            code: "DUPLICATE_INTENT",
            severity: "high",
            message: "This execution intent matches a recent request and was blocked."
          }
        ],
        modifications: []
      };
      const receipt = createReceipt({ intent, decision, policy: this.policy, now });
      this.receipts.push(receipt);
      return { decision, execution: null, receipt };
    }

    const decision = evaluateIntent(intent, this.policy, this.state, now);
    let execution = null;

    if (decision.verdict === "allow" || decision.verdict === "modify") {
      execution = await this.executor.execute(decision.intent);
      this.rememberIntent(intent, now);
    }

    const receipt = createReceipt({
      intent,
      decision,
      execution,
      policy: this.policy,
      now
    });

    this.receipts.push(receipt);
    return { decision, execution, receipt };
  }

  checkDuplicate(intent, now) {
    if (intent.type !== "place_order" && intent.type !== "modify_order") {
      return false;
    }

    const key = tradeFingerprint(intent);
    const previous = this.state.seenIntents.get(key);
    if (!previous) return false;

    return now - previous < this.policy.security.duplicateWindowMs;
  }

  rememberIntent(intent, now) {
    if (intent.type !== "place_order" && intent.type !== "modify_order") {
      return;
    }

    this.state.seenIntents.set(tradeFingerprint(intent), now);
  }
}

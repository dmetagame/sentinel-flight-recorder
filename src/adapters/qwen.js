import { mergePolicy } from "../core/policy.js";

const DEFAULT_BASE_URL = "https://hackathon.bitgetops.com/v1";
const DEFAULT_MODEL = "qwen3.6-plus";
const DEFAULT_COMPILE_TIMEOUT_MS = 12_000;
const DEFAULT_EXPLAIN_TIMEOUT_MS = 3_000;

export function compilePolicyFromText(text, basePolicy = {}) {
  const policy = mergePolicy(basePolicy);
  const lower = text.toLowerCase();

  const risk = lower.match(/(?:risk|lose)\s+(?:at most|maximum|max|under|no more than)?\s*(\d+(?:\.\d+)?)\s*%/);
  if (risk) {
    policy.trade.maxRiskPct = Number(risk[1]);
  }

  const leverage =
    lower.match(/(?:leverage|leveraged)\s+(?:at most|maximum|max|under|no more than)?\s*(\d+(?:\.\d+)?)\s*x/) ??
    lower.match(/(?:at most|maximum|max|under|no more than)?\s*(\d+(?:\.\d+)?)\s*x\s+(?:leverage|leveraged)/);
  if (leverage) {
    policy.trade.maxLeverage = Number(leverage[1]);
  }

  const dailyLoss = lower.match(/(?:daily loss|stop trading after losing|loss cap)\s+(?:at most|maximum|max|under|no more than)?\s*(\d+(?:\.\d+)?)\s*%/);
  if (dailyLoss) {
    policy.portfolio.maxDailyLossPct = Number(dailyLoss[1]);
  }

  const symbols = [];
  if (/\bbtc\b|btcusdt/.test(lower)) symbols.push("BTCUSDT");
  if (/\beth\b|ethusdt/.test(lower)) symbols.push("ETHUSDT");
  if (/\bsol\b|solusdt/.test(lower)) symbols.push("SOLUSDT");
  if (symbols.length && /only|allow|trade/.test(lower)) {
    policy.allowedSymbols = symbols;
  }

  if (/stop loss|stop-loss|sl\b/.test(lower)) {
    policy.trade.requireStopLoss = true;
  }

  return {
    policy,
    source: "deterministic-fallback",
    note: "Live Qwen compilation can be enabled with BITGET_QWEN_API_KEY; fallback parser used for reproducible demos."
  };
}

export async function compilePolicy(text, basePolicy = {}, env = process.env) {
  const apiKey = env.BITGET_QWEN_API_KEY;
  if (!apiKey) {
    return compilePolicyFromText(text, basePolicy);
  }

  try {
    const base = mergePolicy(basePolicy);
    const response = await callQwen({
      apiKey,
      baseUrl: env.BITGET_QWEN_BASE_URL ?? DEFAULT_BASE_URL,
      model: env.BITGET_QWEN_MODEL ?? DEFAULT_MODEL,
      timeoutMs: timeoutMsFromEnv(env.BITGET_QWEN_TIMEOUT_MS, DEFAULT_COMPILE_TIMEOUT_MS),
      messages: [
        {
          role: "system",
          content: [
            "You convert trading-risk mandates into strict JSON policy overrides.",
            "Return only JSON. Do not include markdown.",
            "Allowed top-level keys: portfolio, trade, data, security, allowedSymbols.",
            "Never loosen unspecified fields. Never set allowTransfers true."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            mandate: text,
            basePolicy: base
          })
        }
      ]
    });

    const overrides = parseJsonObject(response);
    return {
      policy: applyPolicyOverrides(base, overrides),
      source: "qwen",
      raw: response
    };
  } catch (error) {
    const fallback = compilePolicyFromText(text, basePolicy);
    return {
      ...fallback,
      source: "deterministic-fallback-after-qwen-error",
      error: error.message
    };
  }
}

export function explainDecision(result) {
  const { decision } = result;
  if (decision.verdict === "allow") {
    return "Allowed: the intent satisfies the active Sentinel policy.";
  }

  if (decision.verdict === "modify") {
    const changes = decision.modifications.map((item) => item.message).join(" ");
    return `Modified before execution: ${changes}`;
  }

  const reasons = decision.violations.map((item) => item.message).join(" ");
  return `Blocked: ${reasons}`;
}

export async function explainDecisionWithQwen(result, env = process.env) {
  const apiKey = env.BITGET_QWEN_API_KEY;
  if (!apiKey) {
    return {
      source: "deterministic-fallback",
      text: explainDecision(result)
    };
  }

  try {
    const text = await callQwen({
      apiKey,
      baseUrl: env.BITGET_QWEN_BASE_URL ?? DEFAULT_BASE_URL,
      model: env.BITGET_QWEN_MODEL ?? DEFAULT_MODEL,
      timeoutMs: timeoutMsFromEnv(env.BITGET_QWEN_EXPLAIN_TIMEOUT_MS, DEFAULT_EXPLAIN_TIMEOUT_MS),
      messages: [
        {
          role: "system",
          content: "Explain Sentinel trading-risk decisions in two concise sentences. Do not provide financial advice."
        },
        {
          role: "user",
          content: JSON.stringify({
            verdict: result.decision.verdict,
            violations: result.decision.violations,
            modifications: result.decision.modifications
          })
        }
      ]
    });

    return {
      source: "qwen",
      text
    };
  } catch (error) {
    return {
      source: "deterministic-fallback-after-qwen-error",
      text: explainDecision(result),
      error: error.message
    };
  }
}

async function callQwen({ apiKey, baseUrl, model, messages, timeoutMs }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Qwen request failed with ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Qwen response did not include choices[0].message.content.");
  }

  return content;
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  try {
    return requireObject(JSON.parse(trimmed));
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Qwen response did not contain a JSON object.");
    }
    return requireObject(JSON.parse(match[0]));
  }
}

function applyPolicyOverrides(base, overrides) {
  return mergePolicy({
    ...base,
    portfolio: { ...base.portfolio, ...objectOrEmpty(overrides.portfolio) },
    trade: { ...base.trade, ...objectOrEmpty(overrides.trade) },
    data: { ...base.data, ...objectOrEmpty(overrides.data) },
    security: {
      ...base.security,
      ...objectOrEmpty(overrides.security),
      allowTransfers: false
    },
    allowedSymbols: Array.isArray(overrides.allowedSymbols)
      ? overrides.allowedSymbols
      : base.allowedSymbols
  });
}

function requireObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Qwen response must be a JSON object.");
  }
  return value;
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function timeoutMsFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

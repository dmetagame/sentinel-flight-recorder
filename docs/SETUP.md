# Setup

## Requirements

- Node.js 20 or newer
- No runtime npm dependencies

## Local Run

```bash
npm test
npm run bench
npm run demo
npm run dev
```

Open:

```text
http://127.0.0.1:8787
```

The local server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when deploying behind a platform that requires it.

## Enable Qwen

Do not write your API key into source files.

```bash
export BITGET_QWEN_API_KEY="your-key"
export BITGET_QWEN_BASE_URL="https://hackathon.bitgetops.com/v1"
export BITGET_QWEN_MODEL="qwen3.6-plus"
npm run dev
```

When the key is present, Sentinel attempts live Qwen calls for:

- natural-language policy compilation
- short explanations for allow/modify/block decisions

If the key is missing or the request fails, Sentinel falls back to deterministic local behavior so demos do not break.

## API Endpoints

### Compile Policy

```bash
curl -sS -X POST http://127.0.0.1:8787/api/compile-policy \
  -H 'content-type: application/json' \
  -d '{"text":"Trade BTC and ETH only. Risk at most 1% per position. Use maximum 5x leverage."}'
```

### Guard An Agent Hub Tool Call

```bash
curl -sS -X POST http://127.0.0.1:8787/api/tool-call \
  -H 'content-type: application/json' \
  -d '{
    "freshState": true,
    "policyText": "Trade BTC and ETH only. Risk at most 1% per position. Use maximum 5x leverage.",
    "toolCall": {
      "id": "demo-transfer",
      "agentId": "agent",
      "name": "account_transfer",
      "arguments": {
        "asset": "USDT",
        "amount": "1000"
      }
    }
  }'
```

### Run Benchmark

```bash
curl -sS http://127.0.0.1:8787/api/bench
```

## Security Notes

- Use paper mode for demos.
- Do not put exchange API keys in the frontend.
- Do not commit `.env`.
- Keep transfer and withdrawal tools blocked by default.
- Qwen can explain or compile policy, but deterministic code authorizes execution.

## MCP Proxy Mode

Sentinel can run as a stdio MCP proxy:

```bash
npm run mcp:proxy
```

Without an upstream process, it exposes local Sentinel demo tools. To proxy to a real upstream MCP server, configure the command with environment variables:

```bash
export SENTINEL_UPSTREAM_COMMAND="npx"
export SENTINEL_UPSTREAM_ARGS="-y bitget-mcp-server"
npm run mcp:proxy
```

For local development, use paper/read-only exchange credentials wherever possible. Sentinel blocks dangerous write calls before forwarding, but upstream credentials still need least privilege.

To run the optional child-process MCP integration test in a normal local shell:

```bash
RUN_STDIO_MCP_TESTS=1 npm test
```

The default test suite always covers MCP framing. The child-process test is opt-in because some managed sandboxes do not deliver stdio reliably for long-running spawned Node processes.

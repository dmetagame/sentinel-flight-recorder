# Deployment

## Vercel

Sentinel can run as a static dashboard plus Vercel serverless API routes.

```bash
npx vercel@latest --prod --yes
```

The deployed dashboard uses:

- `GET /api/bench`
- `POST /api/compile-policy`
- `POST /api/evaluate`
- `POST /api/tool-call`

## Qwen Environment Variables

For live Qwen policy compilation and explanation, configure these on the hosting platform:

```text
BITGET_QWEN_API_KEY=...
BITGET_QWEN_BASE_URL=https://hackathon.bitgetops.com/v1
BITGET_QWEN_MODEL=qwen3.6-plus
```

If `BITGET_QWEN_API_KEY` is absent, Sentinel falls back to deterministic local policy parsing and explanations.

## Security

Use paper-safe mode for the public demo. Do not expose exchange API keys to a hosted frontend or unauthenticated public API.

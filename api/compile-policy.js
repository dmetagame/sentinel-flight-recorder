import { compilePolicy } from "../src/adapters/qwen.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = parseBody(req.body);
  const payload = await compilePolicy(body.text ?? "", body.policy ?? {});
  res.status(200).json(payload);
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  return body;
}

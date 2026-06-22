import { compilePolicy } from "../src/adapters/qwen.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = parseBody(req.body);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  if (!body || typeof body !== "object" || typeof body.text !== "string" || !body.text.trim()) {
    res.status(400).json({ error: "Missing required field: text" });
    return;
  }

  const payload = await compilePolicy(body.text, body.policy ?? {});
  res.status(200).json(payload);
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") return body.trim() ? JSON.parse(body) : {};
  return body;
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const receiptsFile = resolve(process.cwd(), "evidence/benchmark/flight-receipts.jsonl");
const rootFile = resolve(process.cwd(), "evidence/benchmark/receipt-merkle-root.txt");
const anchorFile = resolve(process.cwd(), "evidence/benchmark/anchor-tx.json");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const limit = parseLimit(req.query?.limit);

  let raw;
  try {
    raw = await readFile(receiptsFile, "utf8");
  } catch {
    res.status(200).json({ receipts: [], merkleRoot: null, anchor: null, limit });
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const start = Math.max(0, lines.length - limit);
  const slice = lines.slice(start);
  const receipts = [];
  for (const line of slice) {
    try {
      receipts.push(JSON.parse(line));
    } catch {
      // skip malformed line
    }
  }

  const [merkleRoot, anchor] = await Promise.all([
    readMerkleRoot(),
    readAnchor()
  ]);

  res.status(200).json({
    receipts,
    total: lines.length,
    returned: receipts.length,
    limit,
    merkleRoot,
    anchor
  });
}

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 500);
}

async function readMerkleRoot() {
  try {
    return (await readFile(rootFile, "utf8")).trim();
  } catch {
    return null;
  }
}

async function readAnchor() {
  try {
    return JSON.parse(await readFile(anchorFile, "utf8"));
  } catch {
    return null;
  }
}

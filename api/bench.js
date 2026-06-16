import { runBenchmark } from "../src/bench/run.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = await runBenchmark({ writeArtifacts: false });
  res.status(200).json(payload);
}

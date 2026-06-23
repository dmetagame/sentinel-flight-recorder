# Three-Minute Demo Script

## 0:00 - 0:20

"Bitget Agent Hub gives agents powerful execution tools. Sentinel is the safety control plane in front of those tools."

Show the dashboard and benchmark summary.

## 0:20 - 0:50

Run a normal BTC order.

Point out:

- allow verdict
- stop loss present
- risk below 1%
- paper execution receipt

## 0:50 - 1:20

Run an order without a stop loss.

Point out:

- Sentinel modifies the intent
- deterministic stop loss attached
- execution proceeds only after repair

## 1:20 - 1:50

Run oversized or 50x leverage intent.

Point out:

- leverage capped
- risk resized
- Qwen cannot override deterministic policy

## 1:50 - 2:20

Run malicious transfer and stale-data examples.

Point out:

- transfer is blocked
- stale market data is blocked
- every refusal includes a concrete policy code

## 2:20 - 2:50

Show `evidence/benchmark/flight-receipts.jsonl`.

"Every agent action has a flight-recorder receipt: policy hash, intent hash, decision hash, execution hash, and receipt hash."

## 2:50 - 3:00

"This is infrastructure for other builders: any Bitget trading agent can put Sentinel in front of Agent Hub and prove it can trade safely."

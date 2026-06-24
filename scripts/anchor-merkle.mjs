// Anchor the bench-run Merkle root on BSC testnet as a single self-send tx
// whose calldata is the 32-byte root. Writes evidence/benchmark/anchor-tx.json
// with the resulting tx hash + scanner URL so the README/SUBMISSION can cite it.
//
// Usage:
//   export SENTINEL_ANCHOR_PRIVATE_KEY=0x...      # funded BSC testnet wallet
//   export SENTINEL_ANCHOR_RPC_URL=https://...    # optional override
//   npm run anchor
//
// Get testnet BNB from https://www.bnbchain.org/en/testnet-faucet
//
// Note: viem pulls a vulnerable `ws` transitively (DoS in v8.x). We only use
// the HTTP transport, so the WebSocket code path is unreachable at runtime.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const rootFile = resolve(root, "evidence/benchmark/receipt-merkle-root.txt");
const outFile = resolve(root, "evidence/benchmark/anchor-tx.json");

const privateKey = process.env.SENTINEL_ANCHOR_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  console.error("SENTINEL_ANCHOR_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.");
  console.error("Get testnet BNB at https://www.bnbchain.org/en/testnet-faucet");
  process.exit(1);
}

const rpcUrl = process.env.SENTINEL_ANCHOR_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545";

const merkleRoot = (await readFile(rootFile, "utf8")).trim();
if (!/^[0-9a-fA-F]{64}$/.test(merkleRoot)) {
  console.error(`Expected 64-char hex Merkle root in ${rootFile}, got: ${merkleRoot.slice(0, 80)}`);
  process.exit(1);
}

const account = privateKeyToAccount(privateKey);
const transport = http(rpcUrl);
const wallet = createWalletClient({ account, chain: bscTestnet, transport });
const publicClient = createPublicClient({ chain: bscTestnet, transport });

console.log(`Anchoring Merkle root: ${merkleRoot}`);
console.log(`  signer:  ${account.address}`);
console.log(`  chain:   BSC testnet (chainId ${bscTestnet.id})`);
console.log(`  rpc:     ${rpcUrl}`);

const balance = await publicClient.getBalance({ address: account.address });
if (balance === 0n) {
  console.error(`\nSigner has zero balance. Fund it via the faucet first.`);
  process.exit(1);
}
console.log(`  balance: ${balance} wei`);

const hash = await wallet.sendTransaction({
  to: account.address,
  value: 0n,
  data: `0x${merkleRoot}`
});

console.log(`\nSubmitted: ${hash}`);
console.log(`Waiting for confirmation…`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

const scanner = `https://testnet.bscscan.com/tx/${hash}`;
console.log(`Confirmed in block ${receipt.blockNumber}`);
console.log(`Scanner: ${scanner}`);

const payload = {
  schema: "sentinel.anchor.v1",
  merkleRoot,
  chainId: bscTestnet.id,
  chainName: "BSC Testnet",
  rpcUrl,
  signer: account.address,
  txHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  scanner,
  anchoredAt: new Date().toISOString()
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nWrote ${outFile}`);

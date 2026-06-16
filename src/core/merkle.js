import { sha256 } from "./hash.js";

export function merkleRoot(hashes) {
  if (!hashes.length) {
    return null;
  }

  let layer = [...hashes].sort();
  while (layer.length > 1) {
    const next = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1] ?? left;
      next.push(sha256(`${left}${right}`));
    }
    layer = next;
  }

  return layer[0];
}

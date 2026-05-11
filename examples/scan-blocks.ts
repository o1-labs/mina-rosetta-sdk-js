/**
 * Polling loop fetching new blocks from chain tip. Demonstrates
 * `networkStatus` + `block` and the basic walk-forward pattern an indexer
 * or exchange's deposit watcher would use.
 */
import { RosettaClient } from '../src/index.js';

const client = new RosettaClient({
  baseUrl: process.env.ROSETTA_URL ?? 'http://localhost:3087',
  network: process.env.NETWORK ?? 'devnet',
});

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5_000);

const status = await client.networkStatus();
let lastIndex = status.current_block_identifier.index;
console.log(`starting from tip ${lastIndex}`);

// eslint-disable-next-line no-constant-condition
while (true) {
  const { current_block_identifier } = await client.networkStatus();
  if (current_block_identifier.index <= lastIndex) {
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  for (let i = lastIndex + 1; i <= current_block_identifier.index; i++) {
    const { block } = await client.block({ index: i });
    if (!block) {
      console.warn(`  block ${i} missing — chain reorg?`);
      continue;
    }
    console.log(
      `  block ${block.block_identifier.index} ${block.block_identifier.hash} (${block.transactions.length} tx)`,
    );
  }
  lastIndex = current_block_identifier.index;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Watch for incoming MINA at a specific address — the canonical exchange
 * deposit-monitoring pattern. Filters `payment_receiver_inc` operations
 * targeted at `WATCH_ADDRESS`.
 */
import { OperationType, RosettaClient } from '../src/index.js';

const watch = process.env.WATCH_ADDRESS;
if (!watch) {
  console.error('set WATCH_ADDRESS=B62q...');
  process.exit(1);
}

const client = new RosettaClient({
  baseUrl: process.env.ROSETTA_URL ?? 'http://localhost:3087',
  network: process.env.NETWORK ?? 'devnet',
});

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5_000);

const status = await client.networkStatus();
let lastIndex = status.current_block_identifier.index;
console.log(`watching ${watch} from block ${lastIndex}`);

// eslint-disable-next-line no-constant-condition
while (true) {
  const { current_block_identifier } = await client.networkStatus();
  if (current_block_identifier.index <= lastIndex) {
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  for (let i = lastIndex + 1; i <= current_block_identifier.index; i++) {
    const { block } = await client.block({ index: i });
    if (!block) continue;

    for (const tx of block.transactions) {
      for (const op of tx.operations) {
        if (
          op.type === OperationType.PaymentReceiverInc &&
          op.account?.address === watch &&
          op.status === 'Applied'
        ) {
          console.log(
            `  deposit: block=${block.block_identifier.index} tx=${tx.transaction_identifier.hash} amount=${op.amount?.value}`,
          );
        }
      }
    }
  }
  lastIndex = current_block_identifier.index;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

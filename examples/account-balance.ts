/**
 * Smoke test for the /account/balance endpoint.
 *
 * Run:
 *   ROSETTA_URL=http://localhost:3087 \
 *   NETWORK=devnet \
 *   TEST_ADDRESS=B62q... \
 *     npm run build && node build/examples/account-balance.js
 */
import { RosettaClient } from '../src/index.js';

const baseUrl = process.env.ROSETTA_URL ?? 'http://localhost:3087';
const network = process.env.NETWORK ?? 'devnet';
const address = process.env.TEST_ADDRESS;

if (!address) {
  console.error('set TEST_ADDRESS=B62q...');
  process.exit(1);
}

const client = new RosettaClient({ baseUrl, network });
const { block_identifier, balances } = await client.accountBalance({ address });

console.log(`block: ${block_identifier.index} (${block_identifier.hash})`);
for (const b of balances) {
  console.log(`  ${b.value} ${b.currency.symbol}`);
}

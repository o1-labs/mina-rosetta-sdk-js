# @o1-labs/mina-rosetta-sdk

TypeScript SDK for [Mina Protocol's](https://minaprotocol.com) Rosetta (Coinbase Mesh) endpoints.

Companion to [`mina-signer`](https://www.npmjs.com/package/mina-signer) — this SDK handles the typed HTTP surface (Data + Construction APIs); `mina-signer` handles the cryptographic signing. Light by design: no dependency on the heavyweight `mesh-sdk` typed clients.

## Install

```sh
npm install @o1-labs/mina-rosetta-sdk
# install mina-signer when you need to construct + submit transactions
npm install mina-signer
```

Requires Node ≥ 20.18.

## Quick start

```ts
import { RosettaClient } from '@o1-labs/mina-rosetta-sdk';

const client = new RosettaClient({
  baseUrl: 'http://localhost:3087',
  network: 'devnet',
});

const status = await client.networkStatus();
console.log('tip:', status.current_block_identifier.index);

const { balances } = await client.accountBalance({ address: 'B62q...' });
for (const b of balances) {
  console.log(`${b.value} ${b.currency.symbol}`);
}
```

## API

### Data API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `networkList()` | `/network/list` | `NetworkListResponse` |
| `networkStatus()` | `/network/status` | `NetworkStatusResponse` |
| `networkOptions()` | `/network/options` | `NetworkOptionsResponse` |
| `block(id?)` | `/block` | `BlockResponse` |
| `accountBalance({ address, tokenId?, blockIdentifier? })` | `/account/balance` | `AccountBalanceResponse` |
| `mempool()` | `/mempool` | `MempoolResponse` |
| `searchTransactions(args)` | `/search/transactions` | `SearchTransactionsResponse` |

### Construction API

| Method | Endpoint | Returns |
| --- | --- | --- |
| `constructionDerive(publicKey)` | `/construction/derive` | `ConstructionDeriveResponse` |
| `constructionPreprocess({ operations, metadata? })` | `/construction/preprocess` | `ConstructionPreprocessResponse` |
| `constructionMetadata({ options, publicKeys? })` | `/construction/metadata` | `ConstructionMetadataResponse` |
| `constructionPayloads({ operations, metadata?, publicKeys? })` | `/construction/payloads` | `ConstructionPayloadsResponse` |
| `constructionCombine({ unsignedTransaction, signatures })` | `/construction/combine` | `ConstructionCombineResponse` |
| `constructionParse({ signed, transaction })` | `/construction/parse` | `ConstructionParseResponse` |
| `constructionHash(signedTransaction)` | `/construction/hash` | `ConstructionHashResponse` |
| `constructionSubmit(signedTransaction)` | `/construction/submit` | `ConstructionSubmitResponse` |

### Escape hatch

`client.post<T>(endpoint, body)` runs any other endpoint through the same retry path — useful for Mina-specific `/call` methods or features not yet typed here.

## Mina helpers

The SDK includes the canonical operation builders so you don't compose `Operation[]` by hand:

```ts
import { buildTransferOperations, buildDelegationOperations } from '@o1-labs/mina-rosetta-sdk';

const transfer = buildTransferOperations({
  sender:         'B62q...',
  receiver:       'B62q...',
  amountNanomina: '1500000000',
  feeNanomina:    '10000000',
});

const delegation = buildDelegationOperations({
  delegator:    'B62q...',
  newDelegate:  'B62q...',
  feeNanomina:  '10000000',
});
```

`buildTransferOperations` produces the three-operation `fee_payment` + `payment_source_dec` + `payment_receiver_inc` layout that Mina's Rosetta server expects. Operation indices and `related_operations` are set per the Rosetta spec.

## Configuration

```ts
const client = new RosettaClient({
  baseUrl: 'http://localhost:3087',
  network: 'devnet',          // or 'mainnet', or a full NetworkIdentifier
  retries: 5,                  // default 3
  retryDelayMs: 10_000,        // default 5000
  timeoutMs: 60_000,           // default 30000
  headers: { 'x-api-key': process.env.API_KEY },
});
```

## Error handling

```ts
import { RosettaApiError, ConnectionError, HttpError } from '@o1-labs/mina-rosetta-sdk';

try {
  await client.networkStatus();
} catch (err) {
  if (err instanceof RosettaApiError) {
    // Rosetta-level error envelope. Inspect err.body.code / err.body.retriable.
    console.error(`Rosetta error ${err.body.code}: ${err.body.message}`);
  } else if (err instanceof ConnectionError) {
    // Exhausted retries on transport failures.
  } else if (err instanceof HttpError) {
    // Non-JSON 4xx or 5xx with no Rosetta envelope.
  }
}
```

Retry policy: transport errors, 5xx, and `retriable: true` Rosetta errors are retried up to `retries` times with `retryDelayMs` backoff. 4xx Rosetta errors with `retriable: false` are not retried — they're deterministic.

## Construction flow with `mina-signer`

Full end-to-end transaction in five steps:

```ts
import Client from 'mina-signer';
import {
  CURVE_TYPE,
  RosettaClient,
  buildTransferOperations,
  type Signature,
} from '@o1-labs/mina-rosetta-sdk';

const rosetta = new RosettaClient({ baseUrl, network: 'devnet' });
const signer = new Client({ network: 'testnet' });

const operations = buildTransferOperations({ sender, receiver, amountNanomina, feeNanomina });
const publicKeys = [{
  hex_bytes: signer.publicKeyToRaw(signer.derivePublicKey(privateKey)),
  curve_type: CURVE_TYPE,
}];

const { options } = await rosetta.constructionPreprocess({ operations });
const { metadata } = await rosetta.constructionMetadata({ options: options ?? {}, publicKeys });
const payloads = await rosetta.constructionPayloads({ operations, metadata, publicKeys });

const combine = signer.rosettaCombinePayload(payloads, privateKey);
const { signed_transaction } = await rosetta.constructionCombine({
  unsignedTransaction: combine.unsigned_transaction,
  signatures: combine.signatures as unknown as Signature[],
});

const result = await rosetta.constructionSubmit(signed_transaction);
console.log('tx hash:', result.transaction_identifier.hash);
```

See `examples/send-transaction.ts` (online signing) and `examples/offline-sign.ts` (cold signing on an air-gapped machine).

## Examples

All examples take config from env vars:

```sh
ROSETTA_URL=http://localhost:3087 \
NETWORK=devnet \
TEST_ADDRESS=B62q... \
  npm run build && node build/examples/account-balance.js
```

See `examples/`:

- `account-balance.ts` — single-shot balance lookup
- `scan-blocks.ts` — polling loop, walks the chain tip
- `track-deposits.ts` — filter `payment_receiver_inc` for an address (exchange deposit pattern)
- `send-transaction.ts` — full Construction API flow with online signing
- `offline-sign.ts` — cold-signing variant (private key never on the networked process)

## Scope

What's in: typed HTTP wrappers, Mina-specific operation builders, re-exports of common Rosetta types.

What's out (use the right tool):

- **Keypair / address management** — use `mina-signer` directly.
- **Archive-node queries** (events, actions, historical blocks beyond Rosetta's window) — use [`@o1-labs/mina-archive-sdk`](https://github.com/o1-labs/mina-archive-sdk-js).
- **Daemon GraphQL** (payment pool, snark worker, etc.) — use the daemon's GraphQL endpoint directly or [`mina-sdk` for Rust/Go/Python](https://github.com/MinaProtocol).
- **Full `mesh-sdk` introspection/parsing** — out of scope by design; this SDK is a thin client, not a Rosetta SDK reimplementation.

## Development

```sh
npm install
npm run build
npm run test:unit
```

Unit tests use a mocked `fetch` (no infra). Integration tests require a running Mina Rosetta server — boot one via [`src/app/rosetta/docker-compose/`](https://github.com/MinaProtocol/mina/tree/develop/src/app/rosetta/docker-compose) in the Mina repo.

## Acknowledgements

The initial `RosettaClient` shape and `buildTransferOperations` helper were lifted from the runnable Rosetta examples added to `MinaProtocol/mina` in [PR #18833](https://github.com/MinaProtocol/mina/pull/18833) — those examples will be migrated to depend on this package.

## License

Apache-2.0 — see [`LICENSE`](./LICENSE).

/**
 * Full Construction API flow: build operations → preprocess → metadata →
 * payloads → sign (with mina-signer) → combine → submit.
 *
 * Uses `mina-signer`'s `rosettaCombinePayload` helper, which takes the
 * `/construction/payloads` response and produces the bytes that go into
 * `/construction/combine`. See `offline-sign.ts` for the cold-signing
 * variant where the private key never touches a networked process.
 *
 * Env:
 *   SENDER_PRIVATE_KEY  (B62q…)
 *   SENDER_ADDRESS      (B62q…)
 *   RECEIVER_ADDRESS    (B62q…)
 *   TRANSFER_AMOUNT     nanomina (default 1_000_000_000 = 1 MINA)
 *   TRANSFER_FEE        nanomina (default 10_000_000 = 0.01 MINA)
 *   ROSETTA_URL, NETWORK   as usual
 */
// @ts-expect-error — mina-signer is an optional peer dep; install separately
import Client from 'mina-signer';

import {
  CURVE_TYPE,
  RosettaClient,
  buildTransferOperations,
  type Signature,
} from '../src/index.js';

const senderPrivateKey = mustEnv('SENDER_PRIVATE_KEY');
const senderAddress = mustEnv('SENDER_ADDRESS');
const receiverAddress = mustEnv('RECEIVER_ADDRESS');
const amount = process.env.TRANSFER_AMOUNT ?? '1000000000';
const fee = process.env.TRANSFER_FEE ?? '10000000';
const network = process.env.NETWORK ?? 'devnet';

const rosetta = new RosettaClient({
  baseUrl: process.env.ROSETTA_URL ?? 'http://localhost:3087',
  network,
});
const signer = new Client({ network: network === 'mainnet' ? 'mainnet' : 'testnet' });

const operations = buildTransferOperations({
  sender: senderAddress,
  receiver: receiverAddress,
  amountNanomina: amount,
  feeNanomina: fee,
});

const senderPublicKey = signer.derivePublicKey(senderPrivateKey);
const senderPublicKeyHex = signer.publicKeyToRaw(senderPublicKey);
const publicKeys = [{ hex_bytes: senderPublicKeyHex, curve_type: CURVE_TYPE }];

console.log('[1/5] /construction/preprocess');
const { options } = await rosetta.constructionPreprocess({ operations });

console.log('[2/5] /construction/metadata');
const { metadata } = await rosetta.constructionMetadata({
  options: options ?? {},
  publicKeys,
});

console.log('[3/5] /construction/payloads');
const payloads = await rosetta.constructionPayloads({
  operations,
  metadata,
  publicKeys,
});

console.log('[4/5] sign + /construction/combine');
const combine = signer.rosettaCombinePayload(payloads, senderPrivateKey);
const { signed_transaction } = await rosetta.constructionCombine({
  unsignedTransaction: combine.unsigned_transaction,
  signatures: combine.signatures as unknown as Signature[],
});

console.log('[5/5] /construction/submit');
const result = await rosetta.constructionSubmit(signed_transaction);
console.log(`submitted: ${result.transaction_identifier.hash}`);

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

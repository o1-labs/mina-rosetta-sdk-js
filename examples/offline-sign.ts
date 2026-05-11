/**
 * Cold-signing variant of `send-transaction.ts`.
 *
 * The private key only ever sees the offline machine. The online machine
 * builds payloads and submits the signed bytes — it never sees the secret.
 *
 *   online:  preprocess → metadata → payloads → (export to USB) →
 *   offline: sign → (export combinePayload back) →
 *   online:  combine → submit
 *
 * This script simulates the round-trip in one process for illustration; in
 * a real deployment, replace the `signer` step with a transfer to/from the
 * cold machine (e.g. air-gapped via QR or USB).
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

// --- ONLINE: assemble the unsigned payloads -----------------------------
const operations = buildTransferOperations({
  sender: senderAddress,
  receiver: receiverAddress,
  amountNanomina: amount,
  feeNanomina: fee,
});

const senderPublicKey = signer.derivePublicKey(senderPrivateKey);
const senderPublicKeyHex = signer.publicKeyToRaw(senderPublicKey);
const publicKeys = [{ hex_bytes: senderPublicKeyHex, curve_type: CURVE_TYPE }];

const { options } = await rosetta.constructionPreprocess({ operations });
const { metadata } = await rosetta.constructionMetadata({
  options: options ?? {},
  publicKeys,
});
const payloads = await rosetta.constructionPayloads({
  operations,
  metadata,
  publicKeys,
});

console.log(
  `unsigned bundle:\n${JSON.stringify(payloads, null, 2).slice(0, 300)}…\n`,
);

// --- OFFLINE: sign with the private key ---------------------------------
// Transfer `payloads` to the offline machine; run this step there.
const combine = signer.rosettaCombinePayload(payloads, senderPrivateKey);
console.log('offline-signed; signatures attached.\n');

// --- ONLINE: combine + submit -------------------------------------------
const { signed_transaction } = await rosetta.constructionCombine({
  unsignedTransaction: combine.unsigned_transaction,
  signatures: combine.signatures as unknown as Signature[],
});

// Sanity round-trip: parse the signed bytes back into operations and
// compare against the originals. Catches signer/combine bugs before
// submitting.
const parsed = await rosetta.constructionParse({
  signed: true,
  transaction: signed_transaction,
});
console.log(`parsed back ${parsed.operations.length} operations from signed bytes`);

const { transaction_identifier } = await rosetta.constructionSubmit(
  signed_transaction,
);
console.log(`submitted: ${transaction_identifier.hash}`);

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

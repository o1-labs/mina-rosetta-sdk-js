import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConnectionError,
  HttpError,
  RosettaApiError,
  RosettaClient,
} from '../src/index.js';

function fakeFetch(
  responses: (Response | Error | (() => Response | Error))[],
): typeof fetch {
  let i = 0;
  const fn: typeof fetch = async () => {
    const r = responses[i++];
    const result = typeof r === 'function' ? r() : r;
    if (result instanceof Error) throw result;
    return result;
  };
  return fn;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('networkStatus returns the parsed envelope', async () => {
  const client = new RosettaClient({
    baseUrl: 'http://x',
    network: 'devnet',
    retries: 1,
    fetch: fakeFetch([
      json({
        current_block_identifier: { index: 100, hash: 'sh' },
        current_block_timestamp: 1700000000000,
        genesis_block_identifier: { index: 1, hash: 'gh' },
        peers: [],
      }),
    ]),
  });
  const status = await client.networkStatus();
  assert.equal(status.current_block_identifier.index, 100);
});

test('network identifier is attached to every request', async () => {
  let captured: any = null;
  const f: typeof fetch = async (_url, init) => {
    captured = JSON.parse(init?.body as string);
    return json({ block: null });
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    network: 'mainnet',
    retries: 1,
    fetch: f,
  });
  await client.block({ index: 5 });
  assert.deepEqual(captured.network_identifier, {
    blockchain: 'mina',
    network: 'mainnet',
  });
});

test('mempoolTransaction sends the transaction identifier and parses the envelope', async () => {
  let captured: any = null;
  let capturedUrl: string | undefined;
  const f: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    captured = JSON.parse(init?.body as string);
    return json({
      transaction: {
        transaction_identifier: { hash: 'Ckp5txhash' },
        operations: [],
      },
    });
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    network: 'devnet',
    retries: 1,
    fetch: f,
  });
  const res = await client.mempoolTransaction('Ckp5txhash');
  assert.equal(capturedUrl, 'http://x/mempool/transaction');
  assert.deepEqual(captured.transaction_identifier, { hash: 'Ckp5txhash' });
  assert.deepEqual(captured.network_identifier, {
    blockchain: 'mina',
    network: 'devnet',
  });
  assert.equal(res.transaction.transaction_identifier.hash, 'Ckp5txhash');
});

test('accountBalance passes optional token id', async () => {
  let captured: any = null;
  const f: typeof fetch = async (_url, init) => {
    captured = JSON.parse(init?.body as string);
    return json({
      block_identifier: { index: 1, hash: 'h' },
      balances: [{ value: '0', currency: { symbol: 'MINA', decimals: 9 } }],
    });
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 1,
    fetch: f,
  });
  await client.accountBalance({ address: 'B62q', tokenId: 'wT' });
  assert.equal(captured.account_identifier.metadata.token_id, 'wT');
});

test('accountBalance omits token_id when not given', async () => {
  let captured: any = null;
  const f: typeof fetch = async (_url, init) => {
    captured = JSON.parse(init?.body as string);
    return json({
      block_identifier: { index: 1, hash: 'h' },
      balances: [],
    });
  };
  const client = new RosettaClient({ baseUrl: 'http://x', retries: 1, fetch: f });
  await client.accountBalance({ address: 'B62q' });
  assert.equal(captured.account_identifier.address, 'B62q');
  assert.equal(captured.account_identifier.metadata, undefined);
});

test('Rosetta error envelope throws RosettaApiError and does not retry', async () => {
  let calls = 0;
  const f: typeof fetch = async () => {
    calls++;
    return json(
      { code: 42, message: 'bad input', retriable: false },
      { status: 400 },
    );
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 3,
    retryDelayMs: 0,
    fetch: f,
  });
  await assert.rejects(
    () => client.networkStatus(),
    (err: unknown) => {
      assert.ok(err instanceof RosettaApiError);
      const e = err as RosettaApiError;
      assert.equal(e.body.code, 42);
      assert.equal(e.body.message, 'bad input');
      assert.equal(e.retriable, false);
      return true;
    },
  );
  assert.equal(calls, 1, 'non-retriable Rosetta errors must not retry');
});

test('retriable: true Rosetta errors do retry', async () => {
  let calls = 0;
  const f: typeof fetch = async () => {
    calls++;
    if (calls < 2) {
      return json(
        { code: 99, message: 'transient', retriable: true },
        { status: 503 },
      );
    }
    return json({ peers: [] });
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 3,
    retryDelayMs: 0,
    fetch: f,
  });
  const result = await client.post<{ peers: unknown[] }>('/network/status', {});
  assert.equal(calls, 2);
  assert.deepEqual(result.peers, []);
});

test('5xx with no JSON body retries then surfaces HttpError', async () => {
  const f: typeof fetch = async () =>
    new Response('upstream broken', { status: 502, statusText: 'Bad Gateway' });
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 2,
    retryDelayMs: 0,
    fetch: f,
  });
  await assert.rejects(
    () => client.networkStatus(),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      return true;
    },
  );
});

test('transport error retries then surfaces ConnectionError', async () => {
  let calls = 0;
  const f: typeof fetch = async () => {
    calls++;
    throw new TypeError('network kaboom');
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 3,
    retryDelayMs: 0,
    fetch: f,
  });
  await assert.rejects(() => client.networkStatus(), ConnectionError);
  assert.equal(calls, 3);
});

test('custom headers are forwarded', async () => {
  let captured: Headers | undefined;
  const f: typeof fetch = async (_url, init) => {
    captured = new Headers(init?.headers);
    return json({ peers: [] });
  };
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 1,
    headers: { 'x-api-key': 'secret' },
    fetch: f,
  });
  await client.networkStatus();
  assert.ok(captured);
  assert.equal(captured.get('x-api-key'), 'secret');
});

test('constructionDerive sends the public key envelope', async () => {
  let captured: any = null;
  const f: typeof fetch = async (_url, init) => {
    captured = JSON.parse(init?.body as string);
    return json({ account_identifier: { address: 'B62q' } });
  };
  const client = new RosettaClient({ baseUrl: 'http://x', retries: 1, fetch: f });
  await client.constructionDerive({ hex_bytes: 'deadbeef', curve_type: 'pallas' });
  assert.equal(captured.public_key.hex_bytes, 'deadbeef');
  assert.equal(captured.public_key.curve_type, 'pallas');
});

test('constructionSubmit returns the new hash', async () => {
  const client = new RosettaClient({
    baseUrl: 'http://x',
    retries: 1,
    fetch: fakeFetch([
      json({ transaction_identifier: { hash: '5JuTx' } }),
    ]),
  });
  const result = await client.constructionSubmit('signed-tx-bytes');
  assert.equal(result.transaction_identifier.hash, '5JuTx');
});

test('rejects baseUrl=""', () => {
  assert.throws(() => new RosettaClient({ baseUrl: '' }), /baseUrl/);
});

test('rejects retries < 1', () => {
  assert.throws(
    () => new RosettaClient({ baseUrl: 'http://x', retries: 0 }),
    /retries/,
  );
});

test('strips trailing slashes from baseUrl', () => {
  const client = new RosettaClient({ baseUrl: 'http://x//' });
  assert.equal(client.baseUrl, 'http://x');
});

test('passes structured NetworkIdentifier through unchanged', () => {
  const client = new RosettaClient({
    baseUrl: 'http://x',
    network: { blockchain: 'mina', network: 'sandbox' },
  });
  assert.deepEqual(client.network, { blockchain: 'mina', network: 'sandbox' });
});

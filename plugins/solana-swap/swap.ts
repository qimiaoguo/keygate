/**
 * solana-swap/swap — Execute a Solana swap via Jupiter Ultra.
 *
 * Jupiter Ultra handles everything: quote + swap tx in one call.
 * We just sign the returned transaction and send it.
 *
 * Reads:
 *   KEYGATE_CREDENTIAL (hex ed25519 secret key, 64 bytes)
 *   KEYGATE_PARAMS (JSON: from_token, to_token, amount, slippage)
 */

import { resolveToken, getDecimals, SOLANA_RPC } from './lib.js';

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const credential = process.env.KEYGATE_CREDENTIAL ?? '';

if (!credential) {
  console.log(JSON.stringify({ success: false, error: 'No credential provided' }));
  process.exit(1);
}

const { from_token, to_token, amount, slippage = 1 } = params;

try {
  // Import @solana/web3.js dynamically
  let solana: typeof import('@solana/web3.js');
  try {
    solana = await import('@solana/web3.js');
  } catch {
    console.log(JSON.stringify({
      success: false,
      error: '@solana/web3.js not installed. Run: npm install @solana/web3.js',
    }));
    process.exit(0);
  }

  const inputMint = resolveToken(from_token);
  const outputMint = resolveToken(to_token);
  const decimals = getDecimals(from_token);
  const amountLamports = Math.floor(amount * 10 ** decimals);

  // Reconstruct keypair from hex secret
  const secretKey = Uint8Array.from(
    (credential.match(/.{1,2}/g) ?? []).map((b: string) => parseInt(b, 16)),
  );
  const keypair = solana.Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.publicKey.toBase58();

  // Jupiter Ultra: single API call for quote + transaction
  const resp = await fetch('https://lite.jup.ag/ultra/v1/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint,
      outputMint,
      amount: amountLamports,
      taker: publicKey,
      slippageBps: Math.floor(slippage * 100),
    }),
  });

  const data = await resp.json() as {
    transaction?: string;
    outAmount?: string;
    requestId?: string;
    error?: string;
  };

  if (!resp.ok || !data.transaction) {
    console.log(JSON.stringify({
      success: false,
      error: data.error ?? 'Failed to get swap transaction',
      from_token, to_token, amount,
    }));
    process.exit(0);
  }

  // Deserialize, sign, and send
  const txBuf = Buffer.from(data.transaction, 'base64');
  const transaction = solana.VersionedTransaction.deserialize(txBuf);
  transaction.sign([keypair]);

  const connection = new solana.Connection(SOLANA_RPC, 'confirmed');
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');

  const outDecimals = getDecimals(to_token);
  const outAmount = data.outAmount ? Number(data.outAmount) / 10 ** outDecimals : null;

  console.log(JSON.stringify({
    success: true,
    from_token,
    to_token,
    amount,
    outAmount,
    txHash: signature,
    requestId: data.requestId,
    confirmed: !confirmation.value.err,
  }));

  // Zero out secret key
  secretKey.fill(0);

} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    from_token, to_token, amount,
  }));
}

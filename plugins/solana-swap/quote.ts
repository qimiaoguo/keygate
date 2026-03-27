/**
 * solana-swap/quote — Get Jupiter swap quote.
 */

import { resolveToken, getDecimals } from './lib.js';

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const { from_token, to_token, amount } = params;

try {
  const inputMint = resolveToken(from_token);
  const outputMint = resolveToken(to_token);
  const decimals = getDecimals(from_token);
  const amountLamports = Math.floor(amount * 10 ** decimals);

  const url = new URL('https://lite.jup.ag/ultra/v1/order');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', String(amountLamports));

  const resp = await fetch(url.toString());
  const data = await resp.json() as Record<string, unknown>;

  if (!resp.ok) {
    console.log(JSON.stringify({
      success: false,
      error: (data as { error?: string }).error ?? `HTTP ${resp.status}`,
      from_token, to_token, amount,
    }));
    process.exit(0);
  }

  const outDecimals = getDecimals(to_token);
  const outAmount = data.outAmount ? Number(data.outAmount) / 10 ** outDecimals : null;

  console.log(JSON.stringify({
    success: true,
    from_token,
    to_token,
    amount,
    outAmount,
    outAmountRaw: data.outAmount,
    priceImpact: data.priceImpactPct,
  }));
} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    from_token, to_token, amount,
  }));
}

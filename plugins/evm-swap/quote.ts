/**
 * evm-swap/quote — Get swap quote from Paraswap without executing.
 *
 * Reads: KEYGATE_PARAMS (JSON: chain, from_token, to_token, amount)
 * No credential needed for quotes.
 * Outputs: JSON to stdout.
 */

import { resolveToken, getChainConfig } from './lib.js';

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const { chain, from_token, to_token, amount } = params;

const chainConfig = getChainConfig(chain);
const srcToken = resolveToken(chain, from_token);
const destToken = resolveToken(chain, to_token);

// Paraswap price route API
const url = new URL('https://apiv5.paraswap.io/prices');
url.searchParams.set('srcToken', srcToken);
url.searchParams.set('destToken', destToken);
url.searchParams.set('amount', String(Math.floor(amount * 1e6))); // Assume 6 decimals for simplicity
url.searchParams.set('srcDecimals', '6');
url.searchParams.set('destDecimals', '18');
url.searchParams.set('network', String(chainConfig.chainId));
url.searchParams.set('side', 'SELL');

try {
  const resp = await fetch(url.toString());
  const data = await resp.json() as Record<string, unknown>;

  if (!resp.ok) {
    console.log(JSON.stringify({
      success: false,
      error: (data as { error?: string }).error ?? `HTTP ${resp.status}`,
      chain,
      from_token,
      to_token,
      amount,
    }));
    process.exit(0);
  }

  const priceRoute = data.priceRoute as Record<string, unknown> | undefined;

  console.log(JSON.stringify({
    success: true,
    chain,
    from_token,
    to_token,
    amount,
    destAmount: priceRoute?.destAmount,
    destAmountHuman: priceRoute?.destAmount
      ? Number(BigInt(priceRoute.destAmount as string)) / 1e18
      : null,
    gasCost: priceRoute?.gasCost,
    bestRoute: priceRoute?.bestRoute,
  }));
} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    chain,
    from_token,
    to_token,
    amount,
  }));
}

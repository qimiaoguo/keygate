/**
 * evm-swap/swap — Execute a DEX swap via Paraswap.
 *
 * Reads:
 *   KEYGATE_CREDENTIAL (hex private key)
 *   KEYGATE_PARAMS (JSON: chain, from_token, to_token, amount, slippage)
 *
 * Flow:
 *   1. Get price quote from Paraswap
 *   2. Build transaction via Paraswap
 *   3. Sign + broadcast via RPC
 *
 * Outputs: JSON to stdout.
 */

import { createHash } from 'node:crypto';
import { resolveToken, getChainConfig } from './lib.js';

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const credential = process.env.KEYGATE_CREDENTIAL ?? '';

if (!credential) {
  console.log(JSON.stringify({ success: false, error: 'No credential provided' }));
  process.exit(1);
}

const { chain, from_token, to_token, amount, slippage = 1 } = params;

try {
  const chainConfig = getChainConfig(chain);
  const srcToken = resolveToken(chain, from_token);
  const destToken = resolveToken(chain, to_token);

  // We need ethers for signing/sending. Since plugins run in isolation,
  // check if it's available, otherwise give a clear error.
  let ethers: typeof import('ethers');
  try {
    ethers = await import('ethers');
  } catch {
    console.log(JSON.stringify({
      success: false,
      error: 'ethers not installed. Run: npm install ethers',
    }));
    process.exit(0);
  }

  const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
  const wallet = new ethers.Wallet(credential, provider);
  const userAddress = wallet.address;

  // Step 1: Get price route
  const srcDecimals = 6;  // USDC default, TODO: auto-detect
  const destDecimals = 18;
  const srcAmountWei = String(BigInt(Math.floor(amount * 10 ** srcDecimals)));

  const priceUrl = new URL('https://apiv5.paraswap.io/prices');
  priceUrl.searchParams.set('srcToken', srcToken);
  priceUrl.searchParams.set('destToken', destToken);
  priceUrl.searchParams.set('amount', srcAmountWei);
  priceUrl.searchParams.set('srcDecimals', String(srcDecimals));
  priceUrl.searchParams.set('destDecimals', String(destDecimals));
  priceUrl.searchParams.set('network', String(chainConfig.chainId));
  priceUrl.searchParams.set('side', 'SELL');
  priceUrl.searchParams.set('userAddress', userAddress);

  const priceResp = await fetch(priceUrl.toString());
  const priceData = await priceResp.json() as { priceRoute?: Record<string, unknown>; error?: string };

  if (!priceResp.ok || !priceData.priceRoute) {
    console.log(JSON.stringify({
      success: false,
      error: priceData.error ?? 'Failed to get price route',
      chain, from_token, to_token, amount,
    }));
    process.exit(0);
  }

  // Step 2: Build transaction
  const txUrl = `https://apiv5.paraswap.io/transactions/${chainConfig.chainId}`;
  const destAmount = priceData.priceRoute.destAmount as string;
  const slippageBps = Math.floor(slippage * 100); // 1% = 100 bps
  const minDestAmount = String(BigInt(destAmount) * BigInt(10000 - slippageBps) / 10000n);

  const txResp = await fetch(txUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      srcToken,
      destToken,
      srcAmount: srcAmountWei,
      destAmount: minDestAmount,
      priceRoute: priceData.priceRoute,
      userAddress,
      partner: 'keygate',
      srcDecimals,
      destDecimals,
    }),
  });

  const txData = await txResp.json() as {
    to?: string;
    data?: string;
    value?: string;
    gasPrice?: string;
    gas?: string;
    chainId?: number;
    error?: string;
  };

  if (!txResp.ok || !txData.to) {
    console.log(JSON.stringify({
      success: false,
      error: txData.error ?? 'Failed to build transaction',
      chain, from_token, to_token, amount,
    }));
    process.exit(0);
  }

  // Step 3: Sign and send
  const tx = await wallet.sendTransaction({
    to: txData.to,
    data: txData.data,
    value: txData.value ?? '0',
    gasLimit: txData.gas ? BigInt(txData.gas) : undefined,
  });

  const receipt = await tx.wait(1);

  console.log(JSON.stringify({
    success: true,
    chain,
    from_token,
    to_token,
    amount,
    destAmount: Number(BigInt(destAmount)) / 10 ** destDecimals,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    gasUsed: receipt?.gasUsed?.toString(),
    status: receipt?.status === 1 ? 'confirmed' : 'failed',
  }));

} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    chain, from_token, to_token, amount,
  }));
}

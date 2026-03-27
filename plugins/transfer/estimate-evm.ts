/**
 * transfer/estimate-evm — Estimate gas for an EVM transfer (read-only).
 * No credential needed.
 */

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const { chain, to, token, amount } = params;

const CHAIN_CONFIG: Record<string, { rpc: string }> = {
  ethereum: { rpc: 'https://eth.llamarpc.com' },
  polygon: { rpc: 'https://polygon.llamarpc.com' },
  arbitrum: { rpc: 'https://arbitrum.llamarpc.com' },
  bsc: { rpc: 'https://bsc.llamarpc.com' },
};

const NATIVE = ['ETH', 'MATIC', 'BNB'];

try {
  let ethers: typeof import('ethers');
  try {
    ethers = await import('ethers');
  } catch {
    console.log(JSON.stringify({ success: false, error: 'ethers not installed' }));
    process.exit(0);
  }

  const chainCfg = CHAIN_CONFIG[chain];
  if (!chainCfg) throw new Error(`Unknown chain: ${chain}`);

  const provider = new ethers.JsonRpcProvider(chainCfg.rpc);
  const feeData = await provider.getFeeData();

  const isNative = NATIVE.includes(token?.toUpperCase());
  const gasLimit = isNative ? 21000n : 65000n; // ERC-20 transfers ~65k

  const gasCostWei = gasLimit * (feeData.gasPrice ?? 0n);
  const gasCostEth = Number(gasCostWei) / 1e18;

  console.log(JSON.stringify({
    success: true,
    chain, to, token, amount,
    gasLimit: gasLimit.toString(),
    gasPrice: feeData.gasPrice?.toString(),
    estimatedCost: gasCostEth,
    currency: chain === 'bsc' ? 'BNB' : chain === 'polygon' ? 'MATIC' : 'ETH',
  }));
} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    chain, to, token, amount,
  }));
}

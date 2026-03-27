/**
 * transfer/send-evm — Send tokens on an EVM chain.
 *
 * This is an ELEVATED action: the sandbox will require a valid
 * approval token before this script is ever called.
 *
 * Reads:
 *   KEYGATE_CREDENTIAL (hex private key)
 *   KEYGATE_PARAMS (JSON: chain, to, token, amount)
 */

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const credential = process.env.KEYGATE_CREDENTIAL ?? '';

if (!credential) {
  console.log(JSON.stringify({ success: false, error: 'No credential provided' }));
  process.exit(1);
}

const { chain, to, token, amount } = params;

const CHAIN_CONFIG: Record<string, { chainId: number; rpc: string }> = {
  ethereum: { chainId: 1, rpc: 'https://eth.llamarpc.com' },
  polygon: { chainId: 137, rpc: 'https://polygon.llamarpc.com' },
  arbitrum: { chainId: 42161, rpc: 'https://arbitrum.llamarpc.com' },
  bsc: { chainId: 56, rpc: 'https://bsc.llamarpc.com' },
};

const NATIVE = ['ETH', 'MATIC', 'BNB', 'AVAX'];

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
  const wallet = new ethers.Wallet(credential, provider);

  const isNative = NATIVE.includes(token.toUpperCase()) || token === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  if (isNative) {
    // Native transfer
    const value = ethers.parseEther(String(amount));
    const tx = await wallet.sendTransaction({ to, value });
    const receipt = await tx.wait(1);

    console.log(JSON.stringify({
      success: true,
      chain, to, token, amount,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      status: receipt?.status === 1 ? 'confirmed' : 'failed',
    }));
  } else {
    // ERC-20 transfer
    const tokenAddress = token.startsWith('0x') ? token : (() => { throw new Error(`Provide token contract address for ERC-20: ${token}`) })();
    const erc20 = new ethers.Contract(tokenAddress, [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
    ], wallet);

    const decimals = await erc20.decimals();
    const amountWei = ethers.parseUnits(String(amount), decimals);
    const tx = await erc20.transfer(to, amountWei);
    const receipt = await tx.wait(1);

    console.log(JSON.stringify({
      success: true,
      chain, to, token, amount,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      status: receipt?.status === 1 ? 'confirmed' : 'failed',
    }));
  }
} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    chain, to, token, amount,
  }));
}

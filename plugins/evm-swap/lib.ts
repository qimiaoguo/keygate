/**
 * Shared utilities for evm-swap plugin.
 */

export const CHAIN_CONFIG: Record<string, { chainId: number; rpc: string; name: string }> = {
  ethereum: { chainId: 1, rpc: 'https://eth.llamarpc.com', name: 'Ethereum' },
  polygon: { chainId: 137, rpc: 'https://polygon.llamarpc.com', name: 'Polygon' },
  arbitrum: { chainId: 42161, rpc: 'https://arbitrum.llamarpc.com', name: 'Arbitrum' },
  bsc: { chainId: 56, rpc: 'https://bsc.llamarpc.com', name: 'BSC' },
};

// Well-known token addresses (add more as needed)
export const TOKEN_MAP: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  polygon: {
    MATIC: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  arbitrum: {
    ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  bsc: {
    BNB: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  },
};

export function resolveToken(chain: string, token: string): string {
  // If it's already an address, return as-is
  if (token.startsWith('0x') && token.length === 42) return token;

  const chainTokens = TOKEN_MAP[chain];
  if (!chainTokens) throw new Error(`Unknown chain: ${chain}`);

  const addr = chainTokens[token.toUpperCase()] ?? chainTokens[token];
  if (!addr) throw new Error(`Unknown token ${token} on ${chain}`);

  return addr;
}

export function getChainConfig(chain: string) {
  const config = CHAIN_CONFIG[chain];
  if (!config) throw new Error(`Unknown chain: ${chain}`);
  return config;
}

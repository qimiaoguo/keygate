/**
 * Shared utilities for solana-swap plugin.
 */

export const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export const TOKEN_MAP: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
};

export function resolveToken(token: string): string {
  if (token.length >= 32) return token; // Already a mint address
  const mint = TOKEN_MAP[token.toUpperCase()];
  if (!mint) throw new Error(`Unknown Solana token: ${token}`);
  return mint;
}

export function getDecimals(token: string): number {
  const sym = token.toUpperCase();
  if (sym === 'SOL') return 9;
  if (sym === 'USDC' || sym === 'USDT') return 6;
  if (sym === 'BONK') return 5;
  return 6; // default
}

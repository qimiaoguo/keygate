/**
 * Mock swap — reads params from env, pretends to execute.
 * In real plugins, KEYGATE_CREDENTIAL would be the private key.
 */

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const hasCredential = !!process.env.KEYGATE_CREDENTIAL;

console.log(JSON.stringify({
  success: true,
  mock: true,
  fromToken: params.from_token ?? 'USDC',
  toToken: params.to_token ?? 'ETH',
  amount: params.amount ?? 0,
  credentialProvided: hasCredential,
  txHash: '0x' + 'mock'.repeat(16),
}));

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');

console.log(JSON.stringify({
  fromToken: params.from_token ?? 'USDC',
  toToken: params.to_token ?? 'ETH',
  amount: params.amount ?? 0,
  price: 3420.50,
  estimatedOutput: (params.amount ?? 0) / 3420.50,
}));

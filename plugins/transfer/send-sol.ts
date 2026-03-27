/**
 * transfer/send-sol — Send SOL or SPL tokens.
 *
 * ELEVATED action: requires approval token.
 *
 * Reads:
 *   KEYGATE_CREDENTIAL (hex ed25519 secret key)
 *   KEYGATE_PARAMS (JSON: to, token, amount)
 */

const params = JSON.parse(process.env.KEYGATE_PARAMS ?? '{}');
const credential = process.env.KEYGATE_CREDENTIAL ?? '';

if (!credential) {
  console.log(JSON.stringify({ success: false, error: 'No credential provided' }));
  process.exit(1);
}

const { to, token, amount } = params;
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

try {
  let solana: typeof import('@solana/web3.js');
  try {
    solana = await import('@solana/web3.js');
  } catch {
    console.log(JSON.stringify({ success: false, error: '@solana/web3.js not installed' }));
    process.exit(0);
  }

  const secretKey = Uint8Array.from(
    (credential.match(/.{1,2}/g) ?? []).map((b: string) => parseInt(b, 16)),
  );
  const keypair = solana.Keypair.fromSecretKey(secretKey);
  const connection = new solana.Connection(SOLANA_RPC, 'confirmed');
  const recipient = new solana.PublicKey(to);

  if (token.toUpperCase() === 'SOL') {
    // Native SOL transfer
    const lamports = Math.floor(amount * 1e9);
    const tx = new solana.Transaction().add(
      solana.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );

    const signature = await solana.sendAndConfirmTransaction(connection, tx, [keypair]);

    console.log(JSON.stringify({
      success: true,
      to, token, amount,
      txHash: signature,
      confirmed: true,
    }));
  } else {
    // SPL token transfer — requires @solana/spl-token
    let splToken: typeof import('@solana/spl-token');
    try {
      splToken = await import('@solana/spl-token');
    } catch {
      console.log(JSON.stringify({ success: false, error: '@solana/spl-token not installed' }));
      process.exit(0);
    }

    const mint = new solana.PublicKey(token.length >= 32 ? token : (() => { throw new Error(`Provide mint address for SPL token: ${token}`) })());

    // Get or create associated token accounts
    const fromAta = await splToken.getOrCreateAssociatedTokenAccount(
      connection, keypair, mint, keypair.publicKey,
    );
    const toAta = await splToken.getOrCreateAssociatedTokenAccount(
      connection, keypair, mint, recipient,
    );

    // Get decimals
    const mintInfo = await splToken.getMint(connection, mint);
    const amountRaw = BigInt(Math.floor(amount * 10 ** mintInfo.decimals));

    const signature = await splToken.transfer(
      connection, keypair,
      fromAta.address, toAta.address,
      keypair.publicKey, amountRaw,
    );

    console.log(JSON.stringify({
      success: true,
      to, token, amount,
      txHash: typeof signature === 'string' ? signature : signature.toString(),
      confirmed: true,
    }));
  }

  // Zero out secret key
  secretKey.fill(0);

} catch (err) {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
    to, token, amount,
  }));
}

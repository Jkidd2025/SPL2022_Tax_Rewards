const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, createSetAuthorityInstruction, AuthorityType } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        // Load configuration
        const config = JSON.parse(fs.readFileSync('./config.mainnet.json', 'utf-8'));
        
        // Connect to mainnet
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 120000,
            preflightCommitment: 'confirmed',
            timeout: 120000
        });

        // Load mint authority keypair
        const mintAuthorityKeypair = loadKeypair('./wallets/mainnet/mint-authority.json');
        
        // Get token mint
        const mintPubkey = new PublicKey(config.tokens.base.mint);

        // Create transaction to disable mint authority
        const transaction = new Transaction().add(
            createSetAuthorityInstruction(
                mintPubkey,                    // mint account
                mintAuthorityKeypair.publicKey, // current authority
                AuthorityType.MintTokens,      // authority type
                null                           // new authority (null to disable)
            )
        );

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = mintAuthorityKeypair.publicKey;
        transaction.lastValidBlockHeight = lastValidBlockHeight;

        // Sign and send transaction
        console.log('\nDisabling mint authority...');
        console.log('Token Mint:', mintPubkey.toString());
        console.log('Current Mint Authority:', mintAuthorityKeypair.publicKey.toString());
        
        // Double confirmation
        console.log('\n⚠️  WARNING: This action cannot be reversed! ⚠️');
        console.log('Once disabled, no more tokens can ever be minted.');
        console.log('The total supply will be permanently fixed at 1 billion BPAY.\n');
        
        // Proceed with transaction
        transaction.sign(mintAuthorityKeypair);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 5
        });

        // Wait for confirmation
        console.log('Waiting for confirmation...');
        const confirmation = await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
        });

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        console.log('\nMint authority has been successfully disabled!');
        console.log('Signature:', signature);
        console.log('\nNo more tokens can be minted. The supply is now fixed at 1 billion BPAY tokens.');

    } catch (error) {
        console.error('\nError disabling mint authority:', error.message);
        process.exit(1);
    }
}

function loadKeypair(filePath) {
    const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

main(); 
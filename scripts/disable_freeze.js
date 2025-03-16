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

        // Load token authority keypair (current freeze authority)
        const freezeAuthorityKeypair = loadKeypair('./wallets/mainnet/token-authority.json');
        
        // Get token mint
        const mintPubkey = new PublicKey(config.tokens.base.mint);

        // Create transaction to disable freeze authority
        const transaction = new Transaction().add(
            createSetAuthorityInstruction(
                mintPubkey,                      // mint account
                freezeAuthorityKeypair.publicKey, // current authority
                AuthorityType.FreezeAccount,      // authority type
                null                             // new authority (null to disable)
            )
        );

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = freezeAuthorityKeypair.publicKey;
        transaction.lastValidBlockHeight = lastValidBlockHeight;

        // Sign and send transaction
        console.log('\nDisabling freeze authority...');
        console.log('Token Mint:', mintPubkey.toString());
        console.log('Current Freeze Authority:', freezeAuthorityKeypair.publicKey.toString());
        
        // Double confirmation
        console.log('\n⚠️  WARNING: This action cannot be reversed! ⚠️');
        console.log('Once disabled, token accounts can never be frozen.');
        console.log('This is typically done to increase decentralization and reduce central control.\n');
        
        // Proceed with transaction
        transaction.sign(freezeAuthorityKeypair);
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

        console.log('\nFreeze authority has been successfully disabled!');
        console.log('Signature:', signature);
        console.log('\nToken accounts can no longer be frozen. This change is permanent.');

    } catch (error) {
        console.error('\nError disabling freeze authority:', error.message);
        process.exit(1);
    }
}

function loadKeypair(filePath) {
    const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

main(); 
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { PROGRAM_ID, createUpdateMetadataAccountV2Instruction } = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');

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

        // Load token authority keypair (current update authority)
        const updateAuthorityKeypair = loadKeypair('./wallets/mainnet/token-authority.json');
        
        // Get token mint
        const mintPubkey = new PublicKey(config.tokens.base.mint);

        // Find metadata PDA
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                PROGRAM_ID.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            PROGRAM_ID
        );

        // Get current metadata
        const metadata = await connection.getAccountInfo(metadataPDA);
        if (!metadata) {
            throw new Error('Metadata account not found');
        }

        // Create instruction to update metadata and remove update authority
        const updateMetadataInstruction = createUpdateMetadataAccountV2Instruction(
            {
                metadata: metadataPDA,
                updateAuthority: updateAuthorityKeypair.publicKey,
            },
            {
                updateMetadataAccountArgsV2: {
                    data: null,
                    updateAuthority: null, // Set to null to remove update authority
                    primarySaleHappened: null,
                    isMutable: false,
                },
            }
        );

        // Create transaction
        const transaction = new Transaction().add(updateMetadataInstruction);

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = updateAuthorityKeypair.publicKey;
        transaction.lastValidBlockHeight = lastValidBlockHeight;

        // Sign and send transaction
        console.log('\nDisabling metadata update authority...');
        console.log('Token Mint:', mintPubkey.toString());
        console.log('Metadata PDA:', metadataPDA.toString());
        console.log('Current Update Authority:', updateAuthorityKeypair.publicKey.toString());
        
        // Double confirmation
        console.log('\n⚠️  WARNING: This action cannot be reversed! ⚠️');
        console.log('Once disabled, token metadata can never be updated.');
        console.log('This is typically done to make the token metadata immutable.\n');
        
        // Proceed with transaction
        transaction.sign(updateAuthorityKeypair);
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

        console.log('\nMetadata update authority has been successfully disabled!');
        console.log('Signature:', signature);
        console.log('\nToken metadata is now immutable. This change is permanent.');

    } catch (error) {
        console.error('\nError disabling metadata update authority:', error.message);
        process.exit(1);
    }
}

function loadKeypair(filePath) {
    const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

main(); 
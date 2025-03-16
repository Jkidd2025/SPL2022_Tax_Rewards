const { Connection, PublicKey } = require('@solana/web3.js');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');

async function main() {
    try {
        // Load configuration
        const config = JSON.parse(fs.readFileSync('./config.mainnet.json', 'utf-8'));
        
        // Connect to mainnet
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });

        // Get token mint
        const mintPubkey = new PublicKey(config.tokens.base.mint);
        
        console.log('\nFetching token metadata...');
        console.log('Token Mint:', mintPubkey.toString());
        
        // Get metadata PDA
        const [metadataPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
                mintPubkey.toBuffer(),
            ],
            new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
        );

        // Fetch metadata account
        const metadataAccount = await Metadata.fromAccountAddress(connection, metadataPDA);
        
        console.log('\nToken Metadata:');
        console.log('Name:', metadataAccount.data.name);
        console.log('Symbol:', metadataAccount.data.symbol);
        console.log('URI:', metadataAccount.data.uri);
        console.log('Seller Fee Basis Points:', metadataAccount.data.sellerFeeBasisPoints);
        console.log('Is Mutable:', metadataAccount.isMutable);
        console.log('Update Authority:', metadataAccount.updateAuthority.toString());
        
        // Try to fetch and display the JSON metadata from URI
        try {
            console.log('\nFetching metadata JSON from URI...');
            const response = await fetch(metadataAccount.data.uri);
            if (response.ok) {
                const jsonMetadata = await response.json();
                console.log('\nMetadata JSON:');
                console.log(JSON.stringify(jsonMetadata, null, 2));
            } else {
                console.log('Failed to fetch metadata JSON:', response.statusText);
            }
        } catch (error) {
            console.log('Error fetching metadata JSON:', error.message);
        }
        
    } catch (error) {
        console.error('\nError checking metadata:', error);
        process.exit(1);
    }
}

main(); 
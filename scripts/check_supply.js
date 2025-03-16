const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');
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
        
        console.log('\nChecking token supply...');
        console.log('Token Mint:', mintPubkey.toString());
        
        // Get mint info
        const mintInfo = await getMint(connection, mintPubkey);
        
        // Calculate total supply
        const totalSupply = Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals);
        
        console.log('\nToken Information:');
        console.log('Decimals:', mintInfo.decimals);
        console.log('Current Supply:', totalSupply.toLocaleString(), config.token.symbol);
        console.log('Mint Authority:', mintInfo.mintAuthority ? mintInfo.mintAuthority.toString() : 'Disabled');
        console.log('Freeze Authority:', mintInfo.freezeAuthority ? mintInfo.freezeAuthority.toString() : 'Disabled');
        
    } catch (error) {
        console.error('\nError checking supply:', error);
        process.exit(1);
    }
}

main(); 
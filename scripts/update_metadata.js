const { Connection, PublicKey } = require('@solana/web3.js');
const TokenManager = require('../src/managers/TokenManager');
const fs = require('fs');
const path = require('path');

async function updateMetadata() {
    try {
        const config = JSON.parse(fs.readFileSync('./config.mainnet.json', 'utf-8'));
        const connection = new Connection(config.network.endpoint, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 120000,
            preflightCommitment: 'confirmed',
            timeout: 120000
        });
        
        // Override the wallet path in TokenManager
        const originalReadKeypair = TokenManager.prototype.readKeypairFromFile;
        TokenManager.prototype.readKeypairFromFile = function(filePath) {
            const fileName = path.basename(filePath);
            const mainnetPath = path.join('./wallets/mainnet', fileName);
            return originalReadKeypair.call(this, mainnetPath);
        };
        
        const tokenManager = new TokenManager(connection);
        const mintPubkey = new PublicKey(config.token.mint);
        const metadata = {
            name: config.token.name,
            symbol: config.token.symbol,
            uri: config.token.metadataUri
        };
        
        console.log('Updating token metadata...');
        await tokenManager.updateTokenMetadata(mintPubkey, metadata);
        console.log('Token metadata updated successfully!');
    } catch (error) {
        console.error('Error updating token metadata:', error);
        process.exit(1);
    }
}

updateMetadata(); 
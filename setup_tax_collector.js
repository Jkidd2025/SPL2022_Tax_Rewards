const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const TokenManager = require('./src/managers/TokenManager');
require('dotenv').config();

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

async function main() {
    try {
        // Create connection to network
        const connection = new Connection(config.network.endpoint);
        console.log('Connecting to Solana network...');

        // Initialize token manager
        const tokenManager = new TokenManager(connection);

        // Generate new keypair for tax collector
        const taxCollectorKeypair = Keypair.generate();
        
        // Create token account for tax collector
        console.log('\nCreating token account for tax collector...');
        const taxCollectorTokenAccount = await tokenManager.createTokenAccount(
            taxCollectorKeypair.publicKey.toBase58()
        );

        // Save tax collector keypair
        const walletsDir = './wallets';
        if (!fs.existsSync(walletsDir)) {
            fs.mkdirSync(walletsDir);
        }
        fs.writeFileSync(
            path.join(walletsDir, 'tax-collector.json'),
            JSON.stringify(Array.from(taxCollectorKeypair.secretKey))
        );

        // Update config with tax collector public key
        config.wallets.taxCollector = {
            publicKey: taxCollectorKeypair.publicKey.toBase58()
        };
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

        console.log('\nTax collector setup completed successfully!');
        console.log('Tax collector public key:', taxCollectorKeypair.publicKey.toBase58());
        console.log('Tax collector token account:', taxCollectorTokenAccount.toBase58());

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
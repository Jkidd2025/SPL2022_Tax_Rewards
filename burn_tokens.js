const { Connection } = require('@solana/web3.js');
const fs = require('fs');
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

        // Get token account balance before burning
        const tokenAccountPubkey = config.wallets.treasury.publicKey;
        const mintPubkey = config.tokenMint;
        
        console.log('\nChecking token balance before burning...');
        const balanceBefore = await tokenManager.getTokenBalance(tokenAccountPubkey);
        console.log(`Current balance: ${balanceBefore} tokens`);

        // Burn tokens
        const burnAmount = 1000; // Amount to burn
        console.log(`\nBurning ${burnAmount} tokens...`);
        const signature = await tokenManager.burnTokens(
            tokenAccountPubkey,
            burnAmount,
            mintPubkey
        );

        // Get token account balance after burning
        console.log('\nChecking token balance after burning...');
        const balanceAfter = await tokenManager.getTokenBalance(tokenAccountPubkey);
        console.log(`New balance: ${balanceAfter} tokens`);
        console.log(`Tokens burned: ${balanceBefore - balanceAfter}`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
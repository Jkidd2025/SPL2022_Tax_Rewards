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

        // Get token account balances before transfer
        const fromAccount = config.wallets.treasury.publicKey;
        const toAccount = config.wallets.tokenAuthority.publicKey;
        
        console.log('\nChecking token balances before transfer...');
        const fromBalanceBefore = await tokenManager.getTokenBalance(fromAccount);
        const toBalanceBefore = await tokenManager.getTokenBalance(toAccount);
        console.log(`From account balance: ${fromBalanceBefore} tokens`);
        console.log(`To account balance: ${toBalanceBefore} tokens`);

        // Transfer tokens with tax
        const transferAmount = 10000; // Amount to transfer
        console.log(`\nTransferring ${transferAmount} tokens with 5% tax...`);
        const signature = await tokenManager.transferTokensWithTax(
            fromAccount,
            toAccount,
            transferAmount
        );

        // Get token account balances after transfer
        console.log('\nChecking token balances after transfer...');
        const fromBalanceAfter = await tokenManager.getTokenBalance(fromAccount);
        const toBalanceAfter = await tokenManager.getTokenBalance(toAccount);
        console.log(`From account balance: ${fromBalanceAfter} tokens`);
        console.log(`To account balance: ${toBalanceAfter} tokens`);

        // Calculate and display the actual transfer amounts
        const taxAmount = transferAmount * 0.05;
        const actualTransferAmount = transferAmount - taxAmount;
        console.log('\nTransfer Summary:');
        console.log(`Original amount: ${transferAmount} tokens`);
        console.log(`Tax amount (5%): ${taxAmount} tokens`);
        console.log(`Actual transfer: ${actualTransferAmount} tokens`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
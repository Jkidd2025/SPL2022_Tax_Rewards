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

        // Check current tax collection balance
        console.log('\nChecking tax collection balance...');
        const currentBalance = await tokenManager.getTaxCollectionBalance();
        console.log(`Current tax collection balance: ${currentBalance} tokens`);

        // If there are collected taxes, ask if user wants to withdraw
        if (currentBalance > 0) {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                readline.question('\nWould you like to withdraw collected taxes? (yes/no): ', resolve);
            });
            readline.close();

            if (answer.toLowerCase() === 'yes') {
                const amountAnswer = await new Promise(resolve => {
                    const readline = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    readline.question(`Enter amount to withdraw (or press Enter to withdraw all ${currentBalance} tokens): `, resolve);
                });

                let withdrawalAmount = null;
                if (amountAnswer.trim() !== '') {
                    withdrawalAmount = parseFloat(amountAnswer);
                    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
                        throw new Error('Invalid withdrawal amount');
                    }
                    if (withdrawalAmount > currentBalance) {
                        throw new Error('Withdrawal amount exceeds collected taxes');
                    }
                }

                const destinationAnswer = await new Promise(resolve => {
                    const readline = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    readline.question('Enter destination account public key: ', resolve);
                });

                console.log('\nProcessing withdrawal...');
                await tokenManager.withdrawCollectedTaxes(destinationAnswer, withdrawalAmount);

                // Check new balance after withdrawal
                console.log('\nChecking new tax collection balance...');
                const newBalance = await tokenManager.getTaxCollectionBalance();
                console.log(`New tax collection balance: ${newBalance} tokens`);
            }
        } else {
            console.log('No collected taxes available for withdrawal.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
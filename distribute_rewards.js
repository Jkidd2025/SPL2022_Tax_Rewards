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

        if (currentBalance <= 0) {
            console.log('No taxes available for distribution.');
            return;
        }

        // Calculate potential reward amount (50% of collected taxes)
        const rewardPercentage = 50;
        const potentialRewardAmount = Math.floor(currentBalance * (rewardPercentage / 100));

        console.log('\nReward Distribution Summary:');
        console.log(`Total collected taxes: ${currentBalance} tokens`);
        console.log(`Reward percentage: ${rewardPercentage}%`);
        console.log(`Potential reward amount: ${potentialRewardAmount} tokens`);

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Ask for confirmation
        const answer = await new Promise(resolve => {
            readline.question('\nWould you like to proceed with reward distribution? (yes/no): ', resolve);
        });

        if (answer.toLowerCase() === 'yes') {
            // Get rewards account
            const rewardsAnswer = await new Promise(resolve => {
                readline.question('Enter rewards account public key: ', resolve);
            });
            readline.close();

            // Distribute rewards
            console.log('\nProcessing reward distribution...');
            await tokenManager.distributeRewards(rewardsAnswer, rewardPercentage);

            // Check remaining balance
            console.log('\nChecking remaining tax collection balance...');
            const remainingBalance = await tokenManager.getTaxCollectionBalance();
            console.log(`Remaining tax collection balance: ${remainingBalance} tokens`);
        } else {
            console.log('\nReward distribution cancelled.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
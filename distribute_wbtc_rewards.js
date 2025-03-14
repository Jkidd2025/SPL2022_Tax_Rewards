const { Connection } = require('@solana/web3.js');
const fs = require('fs');
const TokenManager = require('./src/managers/TokenManager');
const RewardsManager = require('./src/managers/RewardsManager');
require('dotenv').config();

// Load configuration
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

async function main() {
    try {
        // Create connection to network
        const connection = new Connection(config.network.endpoint);
        console.log('Connecting to Solana network...');

        // Initialize managers
        const tokenManager = new TokenManager(connection);
        const rewardsManager = new RewardsManager(connection);

        // Check current tax collection balance
        console.log('\nChecking tax collection balance...');
        const currentBalance = await tokenManager.getTaxCollectionBalance();

        if (currentBalance <= 0) {
            console.log('No taxes available for distribution.');
            return;
        }

        // Calculate reward amount (50% of collected taxes)
        const rewardPercentage = 50;
        const rewardAmount = Math.floor(currentBalance * (rewardPercentage / 100));

        console.log('\nReward Distribution Summary:');
        console.log(`Total collected taxes: ${currentBalance} tokens`);
        console.log(`Reward percentage: ${rewardPercentage}%`);
        console.log(`Amount for WBTC conversion: ${rewardAmount} tokens`);
        console.log(`Minimum token holding requirement: ${config.rewards.minimumTokenHoldingRequirement.toLocaleString()} tokens`);
        console.log(`Minimum WBTC distribution threshold: ${config.wbtc.minimumDistributionThreshold} WBTC`);

        // Get all token holders
        console.log('\nFetching token holder accounts...');
        const holders = await rewardsManager.getTokenHolders();
        console.log(`Found ${holders.length} token holders`);

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Ask for confirmation
        const answer = await new Promise(resolve => {
            readline.question('\nWould you like to proceed with WBTC reward distribution? (yes/no): ', resolve);
        });
        readline.close();

        if (answer.toLowerCase() === 'yes') {
            // First, transfer 50% of taxes to rewards account
            console.log('\nTransferring tokens to rewards account...');
            await tokenManager.withdrawCollectedTaxes(
                config.wallets.rewardsAccount.publicKey,
                rewardAmount
            );

            // Convert tokens to WBTC
            console.log('\nConverting tokens to WBTC...');
            const wbtcAmount = await rewardsManager.convertToWBTC(rewardAmount);

            // Distribute WBTC to token holders
            console.log('\nDistributing WBTC to token holders...');
            const { signature, skippedHolders, skippedDueToMinimumHolding } = await rewardsManager.distributeWBTC(wbtcAmount, holders);

            if (signature) {
                console.log('\nDistribution Results:');
                console.log(`Successfully distributed to ${holders.length - skippedHolders - skippedDueToMinimumHolding} holders`);
                console.log(`Skipped ${skippedDueToMinimumHolding} holders (below ${config.rewards.minimumTokenHoldingRequirement.toLocaleString()} token minimum)`);
                console.log(`Skipped ${skippedHolders} holders (below minimum WBTC threshold)`);
                console.log(`Transaction signature: ${signature}`);

                // Check remaining tax balance
                console.log('\nChecking remaining tax collection balance...');
                const remainingBalance = await tokenManager.getTaxCollectionBalance();
                console.log(`Remaining tax collection balance: ${remainingBalance} tokens`);
            } else {
                if (skippedDueToMinimumHolding === holders.length) {
                    console.log('\nDistribution skipped: No holders meet the minimum token holding requirement');
                } else {
                    console.log('\nDistribution skipped: No qualified holders meet the minimum WBTC threshold');
                }
            }
        } else {
            console.log('\nReward distribution cancelled.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 
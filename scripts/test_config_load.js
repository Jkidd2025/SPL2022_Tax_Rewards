const { Connection } = require('@solana/web3.js');
const path = require('path');
const { log } = require('../src/utils/logger');
const SwapManager = require('../src/managers/SwapManager');
const RewardsManager = require('../src/managers/RewardsManager');

async function testConnection(endpoint) {
    try {
        const connection = new Connection(endpoint);
        const version = await connection.getVersion();
        const slot = await connection.getSlot();
        
        log.info('Connection test successful', {
            version: version['solana-core'],
            slot
        });
        
        return connection;
    } catch (error) {
        log.error('Connection test failed', error);
        throw error;
    }
}

async function testSwapManager(connection, config) {
    try {
        const swapManager = new SwapManager(connection, config);
        await swapManager.initializePool();
        const stats = await swapManager.getPoolStats();
        
        log.info('SwapManager test successful', {
            poolStats: stats
        });
        
        return true;
    } catch (error) {
        log.error('SwapManager test failed', error);
        throw error;
    }
}

async function testRewardsManager(connection, config) {
    try {
        const rewardsManager = new RewardsManager(connection, config);
        const holders = await rewardsManager.getTokenHolders();
        
        log.info('RewardsManager test successful', {
            numberOfHolders: holders.length
        });
        
        return true;
    } catch (error) {
        log.error('RewardsManager test failed', error);
        throw error;
    }
}

async function main() {
    try {
        // Load and verify config
        const ConfigVerifier = require('./verify_config');
        const configPath = path.join(__dirname, '../config.mainnet.json');
        const verifier = new ConfigVerifier(configPath);
        
        log.info('Starting configuration load test');
        
        // Step 1: Verify configuration structure
        const configValid = await verifier.verify();
        if (!configValid) {
            throw new Error('Configuration verification failed');
        }
        
        const config = require(configPath);
        
        // Step 2: Test network connection
        const connection = await testConnection(config.network.endpoint);
        
        // Step 3: Test SwapManager initialization
        await testSwapManager(connection, config);
        
        // Step 4: Test RewardsManager initialization
        await testRewardsManager(connection, config);
        
        log.info('Configuration load test completed successfully');
        process.exit(0);
    } catch (error) {
        log.error('Configuration load test failed', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main(); 
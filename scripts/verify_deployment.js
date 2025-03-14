const { Connection, PublicKey } = require('@solana/web3.js');
const { Token } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const { log } = require('../src/utils/logger');
const SwapManager = require('../src/managers/SwapManager');
const RewardsManager = require('../src/managers/RewardsManager');

async function verifyConfiguration() {
    try {
        const configPath = path.join(__dirname, '../config.mainnet.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Verify all required fields are present
        const requiredFields = [
            'network.endpoint',
            'wallets.tokenAuthority.publicKey',
            'wallets.taxCollector.publicKey',
            'wallets.rewardsAccount.publicKey',
            'wbtc.mint',
            'raydium.poolId',
            'raydium.marketId'
        ];
        
        for (const field of requiredFields) {
            const value = field.split('.').reduce((obj, key) => obj?.[key], config);
            if (!value) {
                throw new Error(`Missing required configuration field: ${field}`);
            }
        }
        
        log.info('Configuration verification passed', {
            configPath,
            network: config.network.endpoint
        });
        
        return config;
    } catch (error) {
        log.error('Configuration verification failed', error);
        throw error;
    }
}

async function verifyConnection(endpoint) {
    try {
        const connection = new Connection(endpoint);
        const version = await connection.getVersion();
        
        log.info('Solana connection verified', {
            endpoint,
            version: version['solana-core']
        });
        
        return connection;
    } catch (error) {
        log.error('Connection verification failed', error);
        throw error;
    }
}

async function verifyAccounts(connection, config) {
    try {
        const accounts = {
            tokenAuthority: new PublicKey(config.wallets.tokenAuthority.publicKey),
            taxCollector: new PublicKey(config.wallets.taxCollector.publicKey),
            rewardsAccount: new PublicKey(config.wallets.rewardsAccount.publicKey)
        };
        
        // Verify account existence and balances
        for (const [name, pubkey] of Object.entries(accounts)) {
            const balance = await connection.getBalance(pubkey);
            if (balance < 1000000) { // 0.001 SOL minimum
                throw new Error(`Insufficient balance in ${name} account`);
            }
            log.info(`Account ${name} verified`, {
                address: pubkey.toString(),
                balance: balance / 1e9
            });
        }
        
        return true;
    } catch (error) {
        log.error('Account verification failed', error);
        throw error;
    }
}

async function verifyTokenAccounts(connection, config) {
    try {
        // Verify WBTC token account
        const wbtcMint = new PublicKey(config.wbtc.mint);
        const wbtcToken = new Token(
            connection,
            wbtcMint,
            Token.PROGRAM_ID,
            null
        );
        
        // Check WBTC mint info
        const mintInfo = await wbtcToken.getMintInfo();
        if (!mintInfo) {
            throw new Error('Failed to fetch WBTC mint info');
        }
        
        log.info('WBTC token verified', {
            mint: config.wbtc.mint,
            decimals: mintInfo.decimals
        });
        
        return true;
    } catch (error) {
        log.error('Token account verification failed', error);
        throw error;
    }
}

async function verifySwapPool(connection, config) {
    try {
        const swapManager = new SwapManager(connection, config);
        await swapManager.initializePool();
        
        // Check pool stats
        const stats = await swapManager.getPoolStats();
        if (!stats || !stats.baseTokenAmount) {
            throw new Error('Failed to fetch pool statistics');
        }
        
        log.info('Swap pool verified', stats);
        return true;
    } catch (error) {
        log.error('Swap pool verification failed', error);
        throw error;
    }
}

async function verifyRewardsSystem(connection, config) {
    try {
        const rewardsManager = new RewardsManager(connection, config);
        
        // Verify rewards account setup
        const holders = await rewardsManager.getTokenHolders();
        log.info('Rewards system verified', {
            numberOfHolders: holders.length
        });
        
        return true;
    } catch (error) {
        log.error('Rewards system verification failed', error);
        throw error;
    }
}

async function main() {
    try {
        log.info('Starting deployment verification');
        
        // Step 1: Verify configuration
        const config = await verifyConfiguration();
        
        // Step 2: Verify Solana connection
        const connection = await verifyConnection(config.network.endpoint);
        
        // Step 3: Verify accounts
        await verifyAccounts(connection, config);
        
        // Step 4: Verify token accounts
        await verifyTokenAccounts(connection, config);
        
        // Step 5: Verify swap pool
        await verifySwapPool(connection, config);
        
        // Step 6: Verify rewards system
        await verifyRewardsSystem(connection, config);
        
        log.info('Deployment verification completed successfully');
        process.exit(0);
    } catch (error) {
        log.error('Deployment verification failed', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
} 
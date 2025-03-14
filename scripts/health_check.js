const { Connection, PublicKey } = require('@solana/web3.js');
const { Token } = require('@solana/spl-token');
const axios = require('axios');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { log } = require('../src/utils/logger');
const SwapManager = require('../src/managers/SwapManager');

class HealthCheck {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.network.endpoint);
        this.swapManager = new SwapManager(this.connection, config);
        this.alertThresholds = {
            minSolBalance: 0.1, // SOL
            minPoolLiquidity: 1000, // USDC equivalent
            maxPriceChange: 0.05, // 5% price change threshold
            minHolders: 10 // Minimum number of token holders
        };
    }

    async checkNetworkConnection() {
        try {
            const version = await this.connection.getVersion();
            const slot = await this.connection.getSlot();
            
            log.info('Network connection healthy', {
                version: version['solana-core'],
                slot
            });
            
            return true;
        } catch (error) {
            log.error('Network connection check failed', error);
            await this.sendAlert('Network Connection Issue', error.message);
            return false;
        }
    }

    async checkAccountBalances() {
        try {
            const accounts = {
                tokenAuthority: new PublicKey(this.config.wallets.tokenAuthority.publicKey),
                taxCollector: new PublicKey(this.config.wallets.taxCollector.publicKey),
                rewardsAccount: new PublicKey(this.config.wallets.rewardsAccount.publicKey)
            };
            
            for (const [name, pubkey] of Object.entries(accounts)) {
                const balance = await this.connection.getBalance(pubkey);
                const solBalance = balance / 1e9;
                
                if (solBalance < this.alertThresholds.minSolBalance) {
                    const message = `Low balance in ${name}: ${solBalance} SOL`;
                    log.warn(message, { account: pubkey.toString() });
                    await this.sendAlert('Low Account Balance', message);
                }
            }
            
            return true;
        } catch (error) {
            log.error('Account balance check failed', error);
            await this.sendAlert('Account Balance Check Failed', error.message);
            return false;
        }
    }

    async checkPoolHealth() {
        try {
            const stats = await this.swapManager.getPoolStats();
            const previousStats = this.loadPreviousStats();
            
            // Check liquidity
            if (parseFloat(stats.baseTokenAmount) < this.alertThresholds.minPoolLiquidity) {
                const message = `Pool liquidity below threshold: ${stats.baseTokenAmount}`;
                log.warn(message);
                await this.sendAlert('Low Pool Liquidity', message);
            }
            
            // Check price change
            if (previousStats && previousStats.price) {
                const priceChange = Math.abs(stats.price - previousStats.price) / previousStats.price;
                if (priceChange > this.alertThresholds.maxPriceChange) {
                    const message = `Large price change detected: ${(priceChange * 100).toFixed(2)}%`;
                    log.warn(message, {
                        currentPrice: stats.price,
                        previousPrice: previousStats.price
                    });
                    await this.sendAlert('Significant Price Change', message);
                }
            }
            
            // Save current stats
            this.saveCurrentStats(stats);
            
            return true;
        } catch (error) {
            log.error('Pool health check failed', error);
            await this.sendAlert('Pool Health Check Failed', error.message);
            return false;
        }
    }

    async checkTokenHolders() {
        try {
            const mint = new PublicKey(this.config.token.mint);
            const accounts = await this.connection.getProgramAccounts(
                Token.PROGRAM_ID,
                {
                    filters: [
                        { dataSize: 165 }, // Size of token account data
                        { memcmp: { offset: 0, bytes: mint.toBase58() } }
                    ]
                }
            );
            
            if (accounts.length < this.alertThresholds.minHolders) {
                const message = `Low number of token holders: ${accounts.length}`;
                log.warn(message);
                await this.sendAlert('Low Token Holder Count', message);
            }
            
            return true;
        } catch (error) {
            log.error('Token holder check failed', error);
            await this.sendAlert('Token Holder Check Failed', error.message);
            return false;
        }
    }

    loadPreviousStats() {
        try {
            const statsPath = path.join(__dirname, '../data/pool_stats.json');
            if (fs.existsSync(statsPath)) {
                return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
            }
            return null;
        } catch (error) {
            log.error('Failed to load previous stats', error);
            return null;
        }
    }

    saveCurrentStats(stats) {
        try {
            const statsDir = path.join(__dirname, '../data');
            if (!fs.existsSync(statsDir)) {
                fs.mkdirSync(statsDir, { recursive: true });
            }
            
            const statsPath = path.join(statsDir, 'pool_stats.json');
            fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
        } catch (error) {
            log.error('Failed to save current stats', error);
        }
    }

    async sendAlert(title, message) {
        try {
            if (this.config.monitoring?.webhookUrl) {
                await axios.post(this.config.monitoring.webhookUrl, {
                    title,
                    message,
                    timestamp: new Date().toISOString(),
                    environment: process.env.NODE_ENV
                });
            }
            
            // Log alert to Sentry if configured
            if (process.env.SENTRY_DSN) {
                const Sentry = require('@sentry/node');
                Sentry.captureMessage(`${title}: ${message}`, 'warning');
            }
        } catch (error) {
            log.error('Failed to send alert', error, {
                title,
                message
            });
        }
    }

    async runHealthCheck() {
        log.info('Starting health check');
        
        const checks = [
            this.checkNetworkConnection(),
            this.checkAccountBalances(),
            this.checkPoolHealth(),
            this.checkTokenHolders()
        ];
        
        const results = await Promise.allSettled(checks);
        const failed = results.filter(r => r.status === 'rejected' || !r.value);
        
        if (failed.length > 0) {
            log.error('Health check failed', {
                totalChecks: checks.length,
                failedChecks: failed.length
            });
        } else {
            log.info('Health check completed successfully');
        }
    }
}

// Start health check if running as main module
if (require.main === module) {
    const configPath = path.join(__dirname, '../config.mainnet.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const healthCheck = new HealthCheck(config);
    
    // Run health check every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        healthCheck.runHealthCheck().catch(error => {
            log.error('Failed to run health check', error);
        });
    });
    
    // Run initial health check
    healthCheck.runHealthCheck().catch(error => {
        log.error('Failed to run initial health check', error);
        process.exit(1);
    });
} 
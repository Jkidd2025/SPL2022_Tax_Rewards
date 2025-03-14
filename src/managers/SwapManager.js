const { Connection, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Liquidity, Market, Percent, Token: RadToken } = require('@raydium-io/raydium-sdk');
const Decimal = require('decimal.js');
const fs = require('fs');
const { log } = require('../utils/logger');

class SwapManager {
    constructor(connection, config) {
        this.connection = connection;
        this.config = config;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.maxTransactionSize = 1232; // Maximum transaction size in bytes
        
        if (!config.raydium?.poolId || !config.wbtc?.mint) {
            throw new Error('Missing required Raydium or WBTC configuration');
        }
    }

    /**
     * Initialize Raydium pool connection
     * @private
     */
    async initializePool() {
        try {
            const market = await Market.load(
                this.connection,
                new PublicKey(this.config.raydium.marketId),
                {},
                new PublicKey(this.config.raydium.marketProgramId)
            );
            
            this.market = market;
            log.info('Pool initialized successfully', {
                marketId: this.config.raydium.marketId,
                poolId: this.config.raydium.poolId
            });
            
            return true;
        } catch (error) {
            log.error('Failed to initialize pool', error, {
                marketId: this.config.raydium.marketId
            });
            throw error;
        }
    }

    /**
     * Get current swap rate from token to WBTC
     * @param {number} amount - Amount of tokens to swap
     * @returns {Promise<number>} - Estimated WBTC amount
     */
    async getSwapEstimate(amount) {
        try {
            const estimate = await this.market.getQuote(amount);
            const minAmountOut = new Decimal(estimate.amountOut)
                .mul(1 - this.config.raydium.slippage)
                .floor()
                .toString();
            
            log.info('Swap estimate calculated', {
                inputAmount: amount,
                estimatedOutput: estimate.amountOut,
                minAmountOut,
                slippage: this.config.raydium.slippage
            });
            
            return {
                estimatedAmount: estimate.amountOut,
                minAmountOut,
                price: estimate.price
            };
        } catch (error) {
            log.error('Failed to get swap estimate', error, { amount });
            throw error;
        }
    }

    /**
     * Swap tokens for WBTC using Raydium
     * @param {string} ownerAddress - Owner's wallet address
     * @param {number} amount - Amount of tokens to swap
     * @returns {Promise<string>} Transaction signature
     */
    async swapTokensForWBTC(ownerAddress, amount) {
        let attempt = 0;
        while (attempt < this.maxRetries) {
            try {
                // Check pool liquidity first
                await this.checkPoolLiquidity(amount);
                
                // Get swap estimate
                const { minAmountOut } = await this.getSwapEstimate(amount);
                
                // Create swap instruction
                const swapInstruction = await this.market.makeSwapInstruction({
                    owner: new PublicKey(ownerAddress),
                    amount,
                    minAmountOut
                });
                
                // Check transaction size
                if (swapInstruction.data.length > this.maxTransactionSize) {
                    throw new Error('Transaction size exceeds maximum limit');
                }
                
                // Create and sign transaction
                const transaction = new Transaction().add(swapInstruction);
                transaction.feePayer = new PublicKey(ownerAddress);
                
                // Get recent blockhash
                const { blockhash } = await this.connection.getRecentBlockhash();
                transaction.recentBlockhash = blockhash;
                
                // Sign and send transaction
                const signature = await sendAndConfirmTransaction(
                    this.connection,
                    transaction,
                    [new PublicKey(ownerAddress)],
                    { commitment: 'confirmed' }
                );
                
                log.transaction(signature, 'success', {
                    type: 'swap',
                    amount,
                    minAmountOut
                });
                
                return signature;
            } catch (error) {
                attempt++;
                if (attempt === this.maxRetries) {
                    log.error('Swap failed after max retries', error, {
                        amount,
                        attempt
                    });
                    throw error;
                }
                
                log.warn(`Swap attempt ${attempt} failed, retrying...`, {
                    error: error.message,
                    amount
                });
                
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    /**
     * Check if pool has sufficient liquidity
     * @param {number} amount - Amount to check
     * @returns {Promise<boolean>}
     */
    async checkPoolLiquidity(amount) {
        try {
            const poolInfo = await this.market.getPoolInfo();
            const requiredLiquidity = new Decimal(amount)
                .mul(this.config.raydium.minimumLiquidity)
                .toString();
            
            if (new Decimal(poolInfo.baseTokenAmount).lt(requiredLiquidity)) {
                throw new Error('Insufficient pool liquidity');
            }
            
            log.info('Pool liquidity check passed', {
                poolLiquidity: poolInfo.baseTokenAmount,
                requiredLiquidity
            });
            
            return true;
        } catch (error) {
            log.error('Pool liquidity check failed', error, {
                amount,
                poolId: this.config.raydium.poolId
            });
            throw error;
        }
    }

    /**
     * Get current pool statistics
     * @returns {Promise<Object>}
     */
    async getPoolStats() {
        try {
            const poolInfo = await this.market.getPoolInfo();
            const stats = {
                baseTokenAmount: poolInfo.baseTokenAmount,
                quoteTokenAmount: poolInfo.quoteTokenAmount,
                price: poolInfo.price,
                volume24h: poolInfo.volume24h
            };
            
            log.info('Pool stats retrieved', stats);
            return stats;
        } catch (error) {
            log.error('Failed to get pool stats', error);
            throw error;
        }
    }
}

module.exports = SwapManager; 
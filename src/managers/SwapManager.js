const { Connection, PublicKey, Transaction } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Liquidity, Market, Percent, Token: RadToken } = require('@raydium-io/raydium-sdk');
const Decimal = require('decimal.js');
const fs = require('fs');

class SwapManager {
    constructor(connection, config) {
        this.connection = connection;
        this.config = config;
        
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
            const poolId = new PublicKey(this.config.raydium.poolId);
            
            // Get pool info
            const poolInfo = await Liquidity.fetchInfo({
                connection: this.connection,
                poolId
            });

            if (!poolInfo) {
                throw new Error('Failed to fetch pool information');
            }

            this.poolInfo = poolInfo;
            return poolInfo;
        } catch (error) {
            console.error('Error initializing Raydium pool:', error);
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
            if (!this.poolInfo) {
                await this.initializePool();
            }

            const amountIn = new Decimal(amount).mul(10 ** this.config.token.decimals);
            
            const { amountOut } = await Liquidity.computeAmountOut({
                poolInfo: this.poolInfo,
                amountIn: amountIn.toString(),
                currencyIn: this.config.tokenMint,
                slippage: new Percent(1, 100) // 1% slippage
            });

            return new Decimal(amountOut).div(10 ** this.config.wbtc.decimals).toNumber();
        } catch (error) {
            console.error('Error getting swap estimate:', error);
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
        try {
            if (!this.poolInfo) {
                await this.initializePool();
            }

            const owner = new PublicKey(ownerAddress);
            const amountIn = new Decimal(amount).mul(10 ** this.config.token.decimals);

            // Get swap instructions
            const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                connection: this.connection,
                poolInfo: this.poolInfo,
                userKeys: {
                    tokenAccounts: [], // Will be populated by SDK
                    owner
                },
                amountIn: amountIn.toString(),
                currencyIn: this.config.tokenMint,
                currencyOut: this.config.wbtc.mint,
                slippage: new Percent(1, 100) // 1% slippage
            });

            // Create and send transaction
            const transaction = new Transaction();
            
            for (const ix of innerTransactions[0].instructions) {
                transaction.add(ix);
            }

            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = owner;

            // Send transaction
            const signature = await this.connection.sendTransaction(transaction, [/* Add required signers */]);
            
            // Confirm transaction
            await this.connection.confirmTransaction({
                signature,
                blockhash: transaction.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            });

            return signature;
        } catch (error) {
            console.error('Error swapping tokens:', error);
            throw error;
        }
    }

    /**
     * Check if pool has sufficient liquidity
     * @param {number} amount - Amount to check
     * @returns {Promise<boolean>}
     */
    async checkPoolLiquidity(amount) {
        try {
            if (!this.poolInfo) {
                await this.initializePool();
            }

            const { baseReserve, quoteReserve } = this.poolInfo;
            const amountIn = new Decimal(amount).mul(10 ** this.config.token.decimals);

            // Check if pool has at least 2x the required liquidity
            return amountIn.lte(baseReserve.div(2));
        } catch (error) {
            console.error('Error checking pool liquidity:', error);
            throw error;
        }
    }

    /**
     * Get current pool statistics
     * @returns {Promise<Object>}
     */
    async getPoolStats() {
        try {
            if (!this.poolInfo) {
                await this.initializePool();
            }

            return {
                liquidity: this.poolInfo.baseReserve.toString(),
                volume24h: this.poolInfo.volume24h?.toString() || '0',
                fee: this.poolInfo.fee.toString(),
                tokenPrice: this.poolInfo.price.toString()
            };
        } catch (error) {
            console.error('Error getting pool stats:', error);
            throw error;
        }
    }
}

module.exports = SwapManager; 
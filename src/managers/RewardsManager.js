const { 
    Connection, 
    PublicKey, 
    Transaction,
} = require('@solana/web3.js');
const { 
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
} = require('@solana/spl-token');
const SwapManager = require('./SwapManager');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class RewardsManager {
    constructor(connection) {
        this.connection = connection;
        
        // Load and validate config
        if (!fs.existsSync('./config.json')) {
            throw new Error('config.json not found');
        }
        
        const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
        
        // Validate config structure
        if (!config.network?.endpoint || !config.wbtc?.mint) {
            throw new Error('Invalid configuration');
        }
        
        this.config = config;
        this.programId = TOKEN_PROGRAM_ID;
        this.swapManager = new SwapManager(connection, config);

        // Load keypairs
        this.loadKeypairs();
    }

    loadKeypairs() {
        try {
            const walletsDir = './wallets';
            
            // Validate wallets directory exists
            if (!fs.existsSync(walletsDir)) {
                throw new Error('Wallets directory not found');
            }
            
            // Load rewards account keypair
            this.rewardsKeypair = this.readKeypairFromFile(path.join(walletsDir, 'rewards.json'));
            
            // Validate keypair matches config
            if (this.rewardsKeypair.publicKey.toBase58() !== this.config.wallets.rewardsAccount.publicKey) {
                throw new Error('Rewards Account keypair does not match config');
            }
        } catch (error) {
            console.error('Error loading keypairs:', error.message);
            throw error;
        }
    }

    readKeypairFromFile(filePath) {
        const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Keypair.fromSecretKey(new Uint8Array(secretKey));
    }

    /**
     * Get all token holder accounts
     * @returns {Promise<Array>} Array of token holder account addresses
     */
    async getTokenHolders() {
        try {
            const accounts = await this.connection.getProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: this.config.tokenMint
                            }
                        }
                    ]
                }
            );

            // Filter out zero balance accounts
            const validAccounts = [];
            for (const account of accounts) {
                const balance = await this.connection.getTokenAccountBalance(account.pubkey);
                if (balance.value.uiAmount > 0) {
                    validAccounts.push({
                        address: account.pubkey,
                        balance: balance.value.uiAmount
                    });
                }
            }

            return validAccounts;
        } catch (error) {
            console.error('Error getting token holders:', error.message);
            throw error;
        }
    }

    /**
     * Convert collected taxes to WBTC
     * @param {number} amount - Amount of tokens to convert
     * @returns {Promise<number>} Amount of WBTC received
     */
    async convertToWBTC(amount) {
        try {
            // Check pool liquidity first
            const hasLiquidity = await this.swapManager.checkPoolLiquidity(amount);
            if (!hasLiquidity) {
                throw new Error('Insufficient pool liquidity for swap');
            }

            // Get swap estimate
            const estimatedWBTC = await this.swapManager.getSwapEstimate(amount);
            console.log(`Estimated WBTC return: ${estimatedWBTC}`);

            // Perform the swap
            const signature = await this.swapManager.swapTokensForWBTC(
                this.rewardsKeypair.publicKey.toString(),
                amount
            );

            console.log('Swap completed successfully');
            console.log('Transaction signature:', signature);

            // Get actual WBTC amount received
            const wbtcAccount = await getAssociatedTokenAddress(
                new PublicKey(this.config.wbtc.mint),
                this.rewardsKeypair.publicKey
            );
            const balance = await this.connection.getTokenAccountBalance(wbtcAccount);
            
            return balance.value.uiAmount;
        } catch (error) {
            console.error('Error converting to WBTC:', error.message);
            throw error;
        }
    }

    /**
     * Distribute WBTC to token holders proportionally
     * @param {number} wbtcAmount - Amount of WBTC to distribute
     * @param {Array} holders - Array of token holder accounts
     * @returns {Promise<{signature: string, skippedHolders: number, skippedDueToMinimumHolding: number}>} Distribution results
     */
    async distributeWBTC(wbtcAmount, holders) {
        try {
            // Filter holders that meet minimum holding requirement
            const qualifiedHolders = holders.filter(holder => holder.balance >= this.config.rewards.minimumTokenHoldingRequirement);
            const skippedDueToMinimumHolding = holders.length - qualifiedHolders.length;

            if (qualifiedHolders.length === 0) {
                console.log('No holders meet the minimum token holding requirement');
                return { 
                    signature: null, 
                    skippedHolders: 0,
                    skippedDueToMinimumHolding: skippedDueToMinimumHolding
                };
            }

            // Calculate total token supply from qualified holders only
            const totalSupply = qualifiedHolders.reduce((sum, holder) => sum + holder.balance, 0);
            
            // Create WBTC transfer instructions
            const instructions = [];
            const wbtcMint = new PublicKey(this.config.wbtc.mint);
            let skippedHolders = 0;
            let validDistributions = 0;
            
            for (const holder of qualifiedHolders) {
                // Calculate holder's share of WBTC
                const share = (holder.balance / totalSupply) * wbtcAmount;
                
                // Skip if share is below minimum threshold
                if (share < this.config.wbtc.minimumDistributionThreshold) {
                    skippedHolders++;
                    continue;
                }

                validDistributions++;

                // Get or create holder's WBTC account
                const holderWBTCAccount = await getAssociatedTokenAddress(
                    wbtcMint,
                    new PublicKey(holder.address)
                );

                // Check if WBTC account exists
                const accountInfo = await this.connection.getAccountInfo(holderWBTCAccount);
                if (!accountInfo) {
                    instructions.push(
                        createAssociatedTokenAccountInstruction(
                            this.rewardsKeypair.publicKey,
                            holderWBTCAccount,
                            new PublicKey(holder.address),
                            wbtcMint
                        )
                    );
                }

                // Create transfer instruction
                const rawAmount = share * Math.pow(10, this.config.wbtc.decimals);
                instructions.push(
                    createTransferInstruction(
                        this.rewardsKeypair.publicKey,
                        holderWBTCAccount,
                        this.rewardsKeypair.publicKey,
                        Math.floor(rawAmount),
                        [],
                        TOKEN_PROGRAM_ID
                    )
                );
            }

            // Check if we have any valid distributions
            if (validDistributions === 0) {
                console.log('No qualified holders meet the minimum distribution threshold');
                return { 
                    signature: null, 
                    skippedHolders,
                    skippedDueToMinimumHolding
                };
            }

            // Create and send transaction
            const transaction = new Transaction().add(...instructions);
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.rewardsKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign and send transaction
            console.log(`Distributing WBTC to ${validDistributions} qualified token holders...`);
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.rewardsKeypair]
            );

            // Wait for confirmation
            await this.confirmTransaction(signature);

            console.log('WBTC distribution completed successfully!');
            console.log('Signature:', signature);
            console.log(`Skipped ${skippedHolders} holders (below minimum WBTC threshold)`);
            console.log(`Skipped ${skippedDueToMinimumHolding} holders (below minimum token holding requirement)`);

            return { signature, skippedHolders, skippedDueToMinimumHolding };
        } catch (error) {
            console.error('Error distributing WBTC:', error.message);
            throw error;
        }
    }

    async confirmTransaction(signature) {
        const latestBlockhash = await this.connection.getLatestBlockhash();
        
        const confirmation = await this.connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        }, 'confirmed');
        
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
        
        return confirmation;
    }
}

module.exports = RewardsManager; 
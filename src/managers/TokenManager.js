const { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    SYSVAR_RENT_PUBKEY,
    LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
    TOKEN_PROGRAM_ID,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    createMintToInstruction,
    createBurnInstruction,
    createTransferInstruction,
    MINT_SIZE,
    TOKEN_ACCOUNT_SIZE
} = require('@solana/spl-token');
const { 
    PROGRAM_ID: METADATA_PROGRAM_ID,
    createCreateMetadataAccountV3Instruction,
    createUpdateMetadataAccountV3Instruction,
    DataV2,
} = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class TokenManager {
    constructor(connection) {
        this.connection = connection;
        
        // Load and validate config
        if (!fs.existsSync('./config.json')) {
            throw new Error('config.json not found');
        }
        
        const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
        
        // Validate config structure
        if (!config.network?.endpoint) {
            throw new Error('Invalid network configuration');
        }
        
        if (!config.wallets?.tokenAuthority?.publicKey ||
            !config.wallets?.mintAuthority?.publicKey ||
            !config.wallets?.treasury?.publicKey ||
            !config.wallets?.taxCollector?.publicKey) {
            throw new Error('Invalid wallet configuration');
        }
        
        this.config = config;
        this.programId = TOKEN_PROGRAM_ID;

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
            
            // Load keypairs
            this.tokenAuthorityKeypair = this.readKeypairFromFile(path.join(walletsDir, 'token-authority.json'));
            this.mintAuthorityKeypair = this.readKeypairFromFile(path.join(walletsDir, 'mint-authority.json'));
            this.treasuryKeypair = this.readKeypairFromFile(path.join(walletsDir, 'treasury.json'));
            this.taxCollectorKeypair = this.readKeypairFromFile(path.join(walletsDir, 'tax-collector.json'));
            
            // Validate keypairs match config
            if (this.tokenAuthorityKeypair.publicKey.toBase58() !== this.config.wallets.tokenAuthority.publicKey) {
                throw new Error('Token Authority keypair does not match config');
            }
            
            if (this.mintAuthorityKeypair.publicKey.toBase58() !== this.config.wallets.mintAuthority.publicKey) {
                throw new Error('Mint Authority keypair does not match config');
            }
            
            if (this.treasuryKeypair.publicKey.toBase58() !== this.config.wallets.treasury.publicKey) {
                throw new Error('Treasury keypair does not match config');
            }

            if (this.taxCollectorKeypair.publicKey.toBase58() !== this.config.wallets.taxCollector.publicKey) {
                throw new Error('Tax Collector keypair does not match config');
            }
        } catch (error) {
            console.error('Error loading keypairs:', error.message);
            throw error;
        }
    }

    // Function to read keypair from file
    readKeypairFromFile(filePath) {
        const secretKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Keypair.fromSecretKey(new Uint8Array(secretKey));
    }

    // Calculate rent-exempt balance
    async getRentExemptBalance(space) {
        const rent = await this.connection.getMinimumBalanceForRentExemption(space);
        return rent;
    }

    // Find metadata PDA
    async findMetadataPda(mintPubkey) {
        const [publicKey] = await PublicKey.findProgramAddress(
            [
                Buffer.from('metadata'),
                METADATA_PROGRAM_ID.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            METADATA_PROGRAM_ID
        );
        return publicKey;
    }

    // Create metadata for token
    async createTokenMetadata(mintPubkey, metadata) {
        try {
            const metadataPda = await this.findMetadataPda(mintPubkey);

            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

            // Create metadata instruction
            const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
                {
                    metadata: metadataPda,
                    mint: mintPubkey,
                    mintAuthority: this.mintAuthorityKeypair.publicKey,
                    payer: this.tokenAuthorityKeypair.publicKey,
                    updateAuthority: this.tokenAuthorityKeypair.publicKey,
                },
                {
                    createMetadataAccountArgsV3: {
                        data: {
                            name: metadata.name,
                            symbol: metadata.symbol,
                            uri: metadata.uri,
                            sellerFeeBasisPoints: 0,
                            creators: null,
                            collection: null,
                            uses: null,
                        },
                        isMutable: true,
                        collectionDetails: null,
                    },
                }
            );

            // Create transaction
            const transaction = new Transaction().add(createMetadataInstruction);
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.tokenAuthorityKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign transaction with both authorities
            transaction.sign(this.tokenAuthorityKeypair, this.mintAuthorityKeypair);

            // Send transaction
            console.log('Creating token metadata...');
            const rawTransaction = transaction.serialize();
            const signature = await this.connection.sendRawTransaction(rawTransaction, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 5
            });

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            await this.confirmTransaction(signature);

            console.log('Token metadata created successfully!');
            console.log('Metadata address:', metadataPda.toBase58());
            console.log('Signature:', signature);

            return metadataPda;
        } catch (error) {
            console.error('Error creating token metadata:', error.message);
            throw error;
        }
    }

    // Update token metadata
    async updateTokenMetadata(mintPubkey, metadata) {
        try {
            const tokenAuthorityKeypair = this.readKeypairFromFile('./wallets/token-authority.json');
            const metadataPda = await this.findMetadataPda(mintPubkey);

            // Create update metadata instruction
            const updateMetadataInstruction = createUpdateMetadataAccountV3Instruction(
                {
                    metadata: metadataPda,
                    updateAuthority: tokenAuthorityKeypair.publicKey,
                },
                {
                    updateMetadataAccountArgsV3: {
                        data: {
                            name: metadata.name,
                            symbol: metadata.symbol,
                            uri: metadata.uri,
                            sellerFeeBasisPoints: 0,
                            creators: null,
                            collection: null,
                            uses: null,
                        },
                        updateAuthority: tokenAuthorityKeypair.publicKey,
                    },
                }
            );

            // Create transaction
            const transaction = new Transaction().add(updateMetadataInstruction);

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = tokenAuthorityKeypair.publicKey;

            // Sign and send transaction
            console.log('Updating token metadata...');
            const signature = await this.connection.sendTransaction(
                transaction,
                [tokenAuthorityKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            const confirmation = await this.connection.confirmTransaction(signature);
            
            if (confirmation.value.err) {
                throw new Error('Failed to update token metadata');
            }

            console.log('Token metadata updated successfully!');
            console.log('Signature:', signature);

            return signature;
        } catch (error) {
            console.error('Error updating token metadata:', error.message);
            throw error;
        }
    }

    // Create new token mint
    async createTokenMint() {
        try {
            const mintAuthorityPubkey = new PublicKey(this.config.wallets.mintAuthority.publicKey);

            // Create mint keypair
            const mintKeypair = Keypair.generate();
            const mintRent = await this.getRentExemptBalance(MINT_SIZE);

            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

            // Create transaction
            const transaction = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: this.tokenAuthorityKeypair.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    lamports: mintRent,
                    space: MINT_SIZE,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(
                    mintKeypair.publicKey,
                    6, // 6 decimals
                    mintAuthorityPubkey,
                    this.tokenAuthorityKeypair.publicKey,
                    TOKEN_PROGRAM_ID
                )
            );

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.tokenAuthorityKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign transaction
            transaction.sign(this.tokenAuthorityKeypair, mintKeypair);

            // Send transaction
            console.log('Creating token mint...');
            const rawTransaction = transaction.serialize();
            const signature = await this.connection.sendRawTransaction(rawTransaction, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 5
            });

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            await this.confirmTransaction(signature);

            console.log('Token mint created successfully!');
            console.log('Mint address:', mintKeypair.publicKey.toBase58());
            console.log('Signature:', signature);

            // Save mint address to config
            this.config.tokenMint = mintKeypair.publicKey.toBase58();
            fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));

            return mintKeypair.publicKey;
        } catch (error) {
            console.error('Error creating token mint:', error.message);
            throw error;
        }
    }

    // Create token account
    async createTokenAccount(ownerPubkey) {
        try {
            const mintPubkey = new PublicKey(this.config.tokenMint);
            const owner = new PublicKey(ownerPubkey);

            // Get associated token account address
            const associatedTokenAddress = await getAssociatedTokenAddress(
                mintPubkey,
                owner
            );

            // Calculate rent
            const rent = await this.getRentExemptBalance(TOKEN_ACCOUNT_SIZE);

            // Create transaction
            const transaction = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    this.tokenAuthorityKeypair.publicKey,
                    associatedTokenAddress,
                    owner,
                    mintPubkey,
                    TOKEN_PROGRAM_ID
                )
            );

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.tokenAuthorityKeypair.publicKey;

            // Sign and send transaction
            console.log('Creating token account...');
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.tokenAuthorityKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            const confirmation = await this.connection.confirmTransaction(signature);
            
            if (confirmation.value.err) {
                throw new Error('Failed to create token account');
            }

            console.log('Token account created successfully!');
            console.log('Account address:', associatedTokenAddress.toBase58());
            console.log('Signature:', signature);

            return associatedTokenAddress;
        } catch (error) {
            console.error('Error creating token account:', error.message);
            throw error;
        }
    }

    // Mint tokens
    async mintTokens(amount, destinationPubkey) {
        try {
            const mintPubkey = new PublicKey(this.config.tokenMint);
            const destination = new PublicKey(destinationPubkey);

            // Create transaction
            const transaction = new Transaction().add(
                createMintToInstruction(
                    mintPubkey,
                    destination,
                    this.mintAuthorityKeypair.publicKey,
                    amount * Math.pow(10, 6), // Convert to 6 decimals
                    [],
                    TOKEN_PROGRAM_ID
                )
            );

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.mintAuthorityKeypair.publicKey;

            // Sign and send transaction
            console.log('Minting tokens...');
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.mintAuthorityKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            const confirmation = await this.connection.confirmTransaction(signature);
            
            if (confirmation.value.err) {
                throw new Error('Failed to mint tokens');
            }

            console.log('Tokens minted successfully!');
            console.log('Signature:', signature);

            return signature;
        } catch (error) {
            console.error('Error minting tokens:', error.message);
            throw error;
        }
    }

    // Get token account balance
    async getTokenBalance(tokenAccountPubkey) {
        try {
            const balance = await this.connection.getTokenAccountBalance(new PublicKey(tokenAccountPubkey));
            return balance.value.uiAmount;
        } catch (error) {
            console.error('Error getting token balance:', error.message);
            throw error;
        }
    }

    /**
     * Calculate tax amount for a given transfer amount
     * @param {number} amount - The transfer amount
     * @returns {number} The tax amount (5% of the transfer amount)
     */
    calculateTax(amount) {
        return Math.floor(amount * 0.05); // 5% tax
    }

    /**
     * Transfer tokens with 5% tax
     * @param {string} fromPubkey - Source token account
     * @param {string} toPubkey - Destination token account
     * @param {number} amount - Amount to transfer
     * @returns {Promise<string>} Transaction signature
     */
    async transferTokensWithTax(fromPubkey, toPubkey, amount) {
        try {
            // Validate inputs
            if (!fromPubkey || !toPubkey || !amount) {
                throw new Error('Missing required parameters for token transfer');
            }

            const mintPubkey = new PublicKey(this.config.tokenMint);
            const from = new PublicKey(fromPubkey);
            const to = new PublicKey(toPubkey);
            const taxCollector = new PublicKey(this.config.wallets.taxCollector.publicKey);

            // Calculate tax amount
            const taxAmount = this.calculateTax(amount);
            const transferAmount = amount - taxAmount;

            // Convert amounts to raw units (considering decimals)
            const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
            const decimals = mintInfo.value.data.parsed.info.decimals;
            const rawTransferAmount = transferAmount * Math.pow(10, decimals);
            const rawTaxAmount = taxAmount * Math.pow(10, decimals);

            // Create transfer instruction for the main amount
            const transferInstruction = createTransferInstruction(
                from,
                to,
                this.tokenAuthorityKeypair.publicKey,
                rawTransferAmount,
                [],
                TOKEN_PROGRAM_ID
            );

            // Create transfer instruction for the tax amount to tax collector
            const taxTransferInstruction = createTransferInstruction(
                from,
                taxCollector,
                this.tokenAuthorityKeypair.publicKey,
                rawTaxAmount,
                [],
                TOKEN_PROGRAM_ID
            );

            // Create transaction
            const transaction = new Transaction()
                .add(transferInstruction)
                .add(taxTransferInstruction);

            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.tokenAuthorityKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign and send transaction
            console.log(`Transferring ${transferAmount} tokens (with ${taxAmount} tax)...`);
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.tokenAuthorityKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            await this.confirmTransaction(signature);

            console.log('Tokens transferred successfully!');
            console.log(`Amount transferred: ${transferAmount}`);
            console.log(`Tax amount: ${taxAmount}`);
            console.log('Signature:', signature);

            return signature;
        } catch (error) {
            console.error('Error transferring tokens with tax:', error.message);
            throw error;
        }
    }

    /**
     * Burns tokens from a specified account
     * @param {string} tokenAccountPubkey - The public key of the token account to burn from
     * @param {number} amount - The amount of tokens to burn
     * @param {string} mintPubkey - The public key of the token mint
     * @returns {Promise<string>} The transaction signature
     */
    async burnTokens(tokenAccountPubkey, amount, mintPubkey) {
        try {
            // Validate inputs
            if (!tokenAccountPubkey || !amount || !mintPubkey) {
                throw new Error('Missing required parameters for token burning');
            }

            // Convert amount to raw units (considering decimals)
            const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintPubkey));
            const decimals = mintInfo.value.data.parsed.info.decimals;
            const rawAmount = amount * Math.pow(10, decimals);

            // Create burn instruction
            const burnInstruction = createBurnInstruction(
                new PublicKey(tokenAccountPubkey),
                new PublicKey(mintPubkey),
                this.tokenAuthorityKeypair.publicKey,
                rawAmount
            );

            // Create transaction
            const transaction = new Transaction().add(burnInstruction);

            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.tokenAuthorityKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign and send transaction
            console.log(`Burning ${amount} tokens...`);
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.tokenAuthorityKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            await this.confirmTransaction(signature);

            console.log('Tokens burned successfully!');
            console.log('Signature:', signature);

            return signature;
        } catch (error) {
            console.error('Error burning tokens:', error.message);
            throw error;
        }
    }

    /**
     * Get the current tax collection balance
     * @returns {Promise<number>} The current balance of collected taxes
     */
    async getTaxCollectionBalance() {
        try {
            const taxCollectorPubkey = new PublicKey(this.config.wallets.taxCollector.publicKey);
            const balance = await this.getTokenBalance(taxCollectorPubkey);
            console.log(`Current tax collection balance: ${balance} tokens`);
            return balance;
        } catch (error) {
            console.error('Error getting tax collection balance:', error.message);
            throw error;
        }
    }

    /**
     * Calculate withdrawal amount based on percentage
     * @param {number} totalAmount - The total amount available
     * @param {number} percentage - The percentage to withdraw (0-100)
     * @returns {number} The calculated amount to withdraw
     */
    calculatePercentageAmount(totalAmount, percentage) {
        if (percentage < 0 || percentage > 100) {
            throw new Error('Percentage must be between 0 and 100');
        }
        return Math.floor(totalAmount * (percentage / 100));
    }

    /**
     * Distribute rewards from collected taxes
     * @param {string} rewardsAccountPubkey - The public key of the rewards account
     * @param {number} percentage - The percentage of collected taxes to distribute (default 50%)
     * @returns {Promise<string>} The transaction signature
     */
    async distributeRewards(rewardsAccountPubkey, percentage = 50) {
        try {
            // Get current tax collection balance
            const currentBalance = await this.getTaxCollectionBalance();
            if (currentBalance <= 0) {
                throw new Error('No taxes available for distribution');
            }

            // Calculate reward amount
            const rewardAmount = this.calculatePercentageAmount(currentBalance, percentage);
            if (rewardAmount <= 0) {
                throw new Error('Calculated reward amount is too small');
            }

            console.log(`\nDistributing ${percentage}% of collected taxes as rewards...`);
            console.log(`Total tax collection: ${currentBalance} tokens`);
            console.log(`Reward amount: ${rewardAmount} tokens`);

            // Withdraw the calculated amount to rewards account
            const signature = await this.withdrawCollectedTaxes(rewardsAccountPubkey, rewardAmount);

            return signature;
        } catch (error) {
            console.error('Error distributing rewards:', error.message);
            throw error;
        }
    }

    /**
     * Withdraw collected taxes to a specified destination
     * @param {string} destinationPubkey - The public key of the destination account
     * @param {number} amount - The amount of taxes to withdraw
     * @param {number} percentage - The percentage of total balance to withdraw
     * @returns {Promise<string>} The transaction signature
     */
    async withdrawCollectedTaxes(destinationPubkey, amount = null, percentage = null) {
        try {
            const taxCollectorPubkey = new PublicKey(this.config.wallets.taxCollector.publicKey);
            const destination = new PublicKey(destinationPubkey);

            // Get current balance
            const currentBalance = await this.getTaxCollectionBalance();

            // Calculate withdrawal amount based on percentage if specified
            if (percentage !== null) {
                amount = this.calculatePercentageAmount(currentBalance, percentage);
            } else if (!amount) {
                amount = currentBalance;
            }

            // Validate amount
            if (amount <= 0) {
                throw new Error('Invalid withdrawal amount');
            }
            if (amount > currentBalance) {
                throw new Error('Withdrawal amount exceeds available balance');
            }

            // Convert amount to raw units
            const mintPubkey = new PublicKey(this.config.tokenMint);
            const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
            const decimals = mintInfo.value.data.parsed.info.decimals;
            const rawAmount = amount * Math.pow(10, decimals);

            // Create transfer instruction
            const transferInstruction = createTransferInstruction(
                taxCollectorPubkey,
                destination,
                this.taxCollectorKeypair.publicKey,
                rawAmount,
                [],
                TOKEN_PROGRAM_ID
            );

            // Create transaction
            const transaction = new Transaction().add(transferInstruction);

            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.taxCollectorKeypair.publicKey;
            transaction.lastValidBlockHeight = lastValidBlockHeight;

            // Sign and send transaction
            console.log(`Withdrawing ${amount} tokens from tax collection...`);
            const signature = await this.connection.sendTransaction(
                transaction,
                [this.taxCollectorKeypair]
            );

            // Wait for confirmation
            console.log('Waiting for confirmation...');
            await this.confirmTransaction(signature);

            console.log('Tax withdrawal completed successfully!');
            console.log('Signature:', signature);

            return signature;
        } catch (error) {
            console.error('Error withdrawing collected taxes:', error.message);
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

module.exports = TokenManager; 
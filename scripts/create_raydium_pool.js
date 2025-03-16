const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL, ComputeBudgetProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createInitializeAccountInstruction, createInitializeMintInstruction, createCloseAccountInstruction } = require('@solana/spl-token');
const { struct, u64, u8, i32, u16 } = require('@project-serum/borsh');
const BN = require('bn.js');
const fs = require('fs');
const path = require('path');
const { Raydium } = require("@raydium-io/raydium-sdk-v2");
require('dotenv').config();

// Raydium CLMM Program ID
const RAYDIUM_CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

// AMM Config ID
const AMM_CONFIG_ID = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');

// Validation constants
const MIN_TICK_SPACING = 1;
const MAX_TICK_SPACING = 1000;
const MIN_TICK = -887220;
const MAX_TICK = 887220;

// Anchor discriminator for create_pool
const CREATE_POOL_DISCRIMINATOR = Buffer.from([
    0x68, 0x47, 0x84, 0x1c, 0x7a, 0xf9, 0xf6, 0x00  // create_pool discriminator
]);

// Define layout outside (it's constant)
const CREATE_POOL_IX_DATA_LAYOUT = struct([
    i32('tick'),         // Initial tick (price)
    u16('tickSpacing')   // Tick spacing
]);

const MAX_RETRIES = 5;
const CONFIRMATION_TIMEOUT = 60;
const INITIAL_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60000;
const TRANSACTION_SPACING_MS = 10000;
const MAX_TRANSACTION_SIZE = 1232;

// Pool Configuration
const baseMint = new PublicKey('DVSSBXY2Kvpt7nmPRfbY9JNdgMnm8y6TvkkwoZiVQUiv');
const quoteMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const baseTokenVault = Keypair.generate();
const quoteTokenVault = Keypair.generate();
const lpMint = Keypair.generate();
const initialTick = 0;
const tickSpacing = 60;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRecentBlockhashWithRetry(connection) {
    let backoff = INITIAL_BACKOFF_MS;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await connection.getLatestBlockhash('finalized');
        } catch (error) {
            if (error.message.includes('429 Too Many Requests')) {
                console.log(`Rate limited, waiting ${backoff/1000} seconds...`);
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
                continue;
            }
            throw error;
        }
    }
    throw new Error('Failed to get recent blockhash after max retries');
}

async function sendAndConfirmTransactionWithRetry(connection, transaction, signers, label = '') {
    let lastError;
    let backoff = INITIAL_BACKOFF_MS;
    
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            console.log(`\n${label} attempt ${i + 1}/${MAX_RETRIES} (backoff: ${backoff/1000}s)...`);
            
            // Get blockhash with retry
            let blockhash, lastValidBlockHeight;
            for (let j = 0; j < 3; j++) {
                try {
                    ({ blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized'));
                    break;
                } catch (error) {
                    if (error.message.includes('429 Too Many Requests')) {
                        console.log(`Rate limited getting blockhash, waiting ${backoff/1000} seconds...`);
                        await sleep(backoff);
                        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
                        continue;
                    }
                    throw error;
                }
            }

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = signers[0].publicKey;
            
            if (!transaction.instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3)) {
                transaction.instructions = [
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }),
                    ...transaction.instructions
                ];
            }

            const signature = await connection.sendTransaction(transaction, signers, {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
                maxRetries: 3
            });
            
            console.log(`${label} sent:`, signature);
            await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
            console.log(`${label} confirmed!`);
            console.log(`Waiting ${TRANSACTION_SPACING_MS/1000} seconds before next transaction...`);
            await sleep(TRANSACTION_SPACING_MS);
            return signature;
        } catch (error) {
            console.log(`\n${label} attempt ${i + 1} failed:`);
            console.error('Error message:', error.message);
            if (error.logs) console.error('Transaction Logs:', error.logs);
            lastError = error;
            
            if (error.message.includes('429 Too Many Requests')) {
                console.log(`Rate limited, waiting ${backoff/1000} seconds...`);
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            } else if (error.message.includes('blockhash not found') || error.message.includes('Block height exceeded')) {
                console.log('Blockhash expired, retrying immediately with new blockhash...');
                continue;
            } else {
                console.log(`Unknown error, waiting ${2000/1000} seconds...`);
                await sleep(2000);
            }
        }
    }
    throw new Error(`Failed to send ${label} after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

async function checkTransactionSize(transaction, connection, feePayer) {
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = feePayer;
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    if (serialized.length > MAX_TRANSACTION_SIZE) {
        throw new Error(`Transaction too large: ${serialized.length} bytes (max ${MAX_TRANSACTION_SIZE})`);
    }
}

async function cleanupAccounts(connection, authority, accounts) {
    console.log('\nCleaning up accounts...');
    for (const account of accounts) {
        try {
            const accountInfo = await connection.getAccountInfo(account.publicKey);
            if (accountInfo) {
                console.log(`Checking account ${account.publicKey.toString()}...`);
                
                if (accountInfo.owner.equals(TOKEN_PROGRAM_ID) || accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
                    // For token accounts, we need to check ownership and close authority
                    const tokenAccountInfo = await connection.getAccountInfo(account.publicKey);
                    if (!tokenAccountInfo) continue;
                    
                    // Parse token account data to get owner and close authority
                    const owner = new PublicKey(tokenAccountInfo.data.slice(32, 64));
                    const closeAuthority = tokenAccountInfo.data[84] === 1 
                        ? new PublicKey(tokenAccountInfo.data.slice(85, 117))
                        : null;

                    // Only attempt to close if we're the owner or have close authority
                    if (owner.equals(authority.publicKey) || (closeAuthority && closeAuthority.equals(authority.publicKey))) {
                        console.log(`Closing token account ${account.publicKey.toString()}...`);
                        const closeIx = createCloseAccountInstruction(
                            account.publicKey,
                            authority.publicKey,
                            authority.publicKey,
                            [],
                            accountInfo.owner
                        );
                        const tx = new Transaction().add(closeIx);
                        await sendAndConfirmTransactionWithRetry(connection, tx, [authority, account], `Close ${account.publicKey.toString()}`);
                    } else {
                        console.log(`Cannot close token account ${account.publicKey.toString()} - not owner or close authority`);
                        console.log(`Owner: ${owner.toString()}`);
                        console.log(`Close Authority: ${closeAuthority ? closeAuthority.toString() : 'Not set'}`);
                    }
                } else {
                    // For non-token accounts, proceed with normal cleanup
                    console.log(`Closing non-token account ${account.publicKey.toString()}...`);
                    const closeIx = SystemProgram.transfer({
                        fromPubkey: account.publicKey,
                        toPubkey: authority.publicKey,
                        lamports: accountInfo.lamports
                    });
                    const tx = new Transaction().add(closeIx);
                    await sendAndConfirmTransactionWithRetry(connection, tx, [authority, account], `Close ${account.publicKey.toString()}`);
                }
            }
        } catch (error) {
            console.error(`Failed to close account ${account.publicKey.toString()}:`, error);
        }
    }
}

async function main() {
    let connection;
    let authority;
    const accountsToCleanup = [];
    try {
        console.log('Creating Raydium CLMM pool...\n');

        // Load authority wallet
        authority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );

        // Connect to Helius RPC with fallback
        const heliusApiKey = process.env.HELIUS_API_KEY;
        let rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT;
        
        if (!heliusApiKey) {
            console.warn('Warning: HELIUS_API_KEY not found in environment variables');
        } else {
            rpcEndpoint = rpcEndpoint.replace('${HELIUS_API_KEY}', heliusApiKey);
        }

        // Initialize connection
        connection = new Connection(rpcEndpoint, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT * 1000
        });

        // Initialize Raydium SDK
        const raydium = await Raydium.load({
            connection,
            owner: authority,
        });

        // Generate keypairs for pool accounts
        const poolKeypair = Keypair.generate();
        const tokenVaultAKeypair = Keypair.generate();
        const tokenVaultBKeypair = Keypair.generate();
        const tokenMintLpKeypair = Keypair.generate();
        const observationKeypair = Keypair.generate();

        // Create pool parameters
        const createPoolParams = {
            programId: RAYDIUM_CLMM_PROGRAM_ID,
            ammConfig: AMM_CONFIG_ID,
            poolCreator: authority.publicKey,
            tokenA: baseMint,
            tokenB: quoteMint,
            initialTick,
            tickSpacing,
            startTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours from now
            // Generated accounts
            poolId: poolKeypair,
            tokenVaultA: tokenVaultAKeypair,
            tokenVaultB: tokenVaultBKeypair,
            tokenMintLp: tokenMintLpKeypair,
            observationId: observationKeypair,
        };

        console.log('Creating pool with parameters:', {
            ...createPoolParams,
            poolId: createPoolParams.poolId.publicKey.toBase58(),
            tokenVaultA: createPoolParams.tokenVaultA.publicKey.toBase58(),
            tokenVaultB: createPoolParams.tokenVaultB.publicKey.toBase58(),
            tokenMintLp: createPoolParams.tokenMintLp.publicKey.toBase58(),
            observationId: createPoolParams.observationId.publicKey.toBase58(),
        });

        try {
            // Create pool transaction
            const { instructions, signers } = await raydium.clmm.makeCreatePoolInstructions({
                poolInfo: createPoolParams,
                makeTxVersion: 0,
            });

            // Create transaction and add compute budget
            const transaction = new Transaction();
            
            // Add compute budget instruction
            const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
                units: 1_400_000,
            });
            transaction.add(computeBudgetIx);
            
            // Add pool creation instructions
            for (const ix of instructions) {
                transaction.add(ix);
            }

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = authority.publicKey;

            // Sign transaction with all required signers
            transaction.sign(authority, ...signers);

            console.log('Sending transaction...');
            const txid = await connection.sendRawTransaction(transaction.serialize());
            
            console.log('Pool created successfully! Transaction ID:', txid);

            // Update config
            const configPath = path.join(__dirname, '../config.mainnet.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config.raydiumClmm = {
                poolId: poolKeypair.publicKey.toString(),
                lpMint: tokenMintLpKeypair.publicKey.toString(),
                baseVault: tokenVaultAKeypair.publicKey.toString(),
                quoteVault: tokenVaultBKeypair.publicKey.toString(),
                ammAuthority: AMM_CONFIG_ID.toString(),
                observationId: observationKeypair.publicKey.toString(),
                initialTick,
                tickSpacing
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

            console.log('\nNext steps:');
            console.log('1. Run initialize_tick_arrays.js to set up tick arrays');
            console.log('2. Run add_initial_liquidity.js to provide liquidity');

        } catch (error) {
            console.error('Error creating Raydium CLMM pool:', error);
            if (connection && authority) {
                await cleanupAccounts(connection, authority, accountsToCleanup);
            }
            process.exit(1);
        }

    } catch (error) {
        console.error('\nError creating Raydium CLMM pool:', error);
        if (connection && authority) {
            await cleanupAccounts(connection, authority, accountsToCleanup);
        }
        process.exit(1);
    }
}

main(); 
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createInitializeAccountInstruction, createInitializeMintInstruction, createCloseAccountInstruction } = require('@solana/spl-token');
const { struct, u64, u8, i32, u16 } = require('@project-serum/borsh');
const BN = require('bn.js');
const fs = require('fs');
const path = require('path');
const { ComputeBudgetProgram } = require('@solana/web3.js');
require('dotenv').config();

// Raydium CLMM Program IDs for different networks
const RAYDIUM_CLMM_PROGRAM_IDS = {
    mainnet: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'),
    devnet: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'), // Same as mainnet for now
    testnet: new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK')  // Same as mainnet for now
};

// AMM Config IDs for different networks
const AMM_CONFIG_IDS = {
    mainnet: new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'),
    devnet: new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'), // Same as mainnet for now
    testnet: new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1')  // Same as mainnet for now
};

// Validation constants
const MIN_TICK_SPACING = 1;
const MAX_TICK_SPACING = 1000;
const MIN_TICK = -887220;
const MAX_TICK = 887220;

// Layout for CLMM CreatePool instruction data
const CREATE_POOL_IX_DATA_LAYOUT = struct([
    u8('instruction'),  // Anchor instruction discriminator
    i32('tick'),       // Initial tick (price)
    u16('tickSpacing') // Tick spacing
]);

const MAX_RETRIES = 5;
const CONFIRMATION_TIMEOUT = 60;
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 32000;
const TRANSACTION_SPACING_MS = 5000;
const MAX_TRANSACTION_SIZE = 1232;

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
            const { blockhash, lastValidBlockHeight } = await getRecentBlockhashWithRetry(connection);
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = signers[0].publicKey;
            
            if (!transaction.instructions.some(ix => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 3)) {
                transaction.instructions = [
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }),
                    ...transaction.instructions
                ];
            }

            console.log(`\nSending ${label} (attempt ${i + 1}/${MAX_RETRIES})...`);
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
            } else {
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

async function createRaydiumClmmPool() {
    let connection;
    let authority;
    const accountsToCleanup = [];
    try {
        console.log('Creating Raydium CLMM pool...\n');

        // Load authority wallet
        authority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );

        // Connect with fallback
        try {
            connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT * 1000
            });
            await connection.getSlot();
        } catch (error) {
            console.log('Primary RPC failed, trying backup...');
            connection = new Connection(process.env.SOLANA_RPC_ENDPOINT_BACKUP, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT * 1000
            });
            await connection.getSlot();
        }

        // Determine network
        const version = await connection.getVersion();
        const network = await connection.getClusterNodes();
        const isMainnet = network.some(node => node.rpc && node.rpc.includes('mainnet'));
        const isDevnet = network.some(node => node.rpc && node.rpc.includes('devnet'));
        const isTestnet = network.some(node => node.rpc && node.rpc.includes('testnet'));

        console.log('\nNetwork Information:');
        console.log('Version:', version);
        console.log('Network:', isMainnet ? 'Mainnet' : isDevnet ? 'Devnet' : isTestnet ? 'Testnet' : 'Unknown');
        console.log('RPC Endpoint:', connection.rpcEndpoint);

        // Set program IDs based on network
        const RAYDIUM_CLMM_PROGRAM_ID = isMainnet ? RAYDIUM_CLMM_PROGRAM_IDS.mainnet :
                                      isDevnet ? RAYDIUM_CLMM_PROGRAM_IDS.devnet :
                                      RAYDIUM_CLMM_PROGRAM_IDS.testnet;

        const AMM_CONFIG_ID = isMainnet ? AMM_CONFIG_IDS.mainnet :
                            isDevnet ? AMM_CONFIG_IDS.devnet :
                            AMM_CONFIG_IDS.testnet;

        console.log('\nUsing Program IDs:');
        console.log('Raydium CLMM Program:', RAYDIUM_CLMM_PROGRAM_ID.toString());
        console.log('AMM Config:', AMM_CONFIG_ID.toString());

        // Validate program IDs
        console.log('\nValidating program IDs...');
        const [raydiumInfo, token2022Info, tokenInfo, ammConfigInfo] = await Promise.all([
            connection.getAccountInfo(RAYDIUM_CLMM_PROGRAM_ID),
            connection.getAccountInfo(TOKEN_2022_PROGRAM_ID),
            connection.getAccountInfo(TOKEN_PROGRAM_ID),
            connection.getAccountInfo(AMM_CONFIG_ID)
        ]);
        
        console.log('Program ID validation results:');
        console.log('Raydium CLMM Program:', raydiumInfo ? 'Found' : 'Not found');
        console.log('Token-2022 Program:', token2022Info ? 'Found' : 'Not found');
        console.log('Token Program:', tokenInfo ? 'Found' : 'Not found');
        console.log('AMM Config:', ammConfigInfo ? 'Found' : 'Not found');

        if (!raydiumInfo) throw new Error('Raydium CLMM program not found');
        if (!token2022Info) throw new Error('Token-2022 program not found');
        if (!tokenInfo) throw new Error('Token program not found');
        if (!ammConfigInfo) throw new Error('AMM config not found');

        // Pool accounts
        const poolKeypair = Keypair.generate();
        const lpMintKeypair = Keypair.generate();
        const baseTokenAccountKeypair = Keypair.generate();
        const quoteTokenAccountKeypair = Keypair.generate();
        const baseMint = new PublicKey('DVSSBXY2Kvpt7nmPRfbY9JNdgMnm8y6TvkkwoZiVQUiv'); // Token-2022 assumed
        const quoteMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC

        accountsToCleanup.push(poolKeypair, lpMintKeypair, baseTokenAccountKeypair, quoteTokenAccountKeypair);

        console.log('Pool ID:', poolKeypair.publicKey.toString());

        // Verify baseMint ownership
        console.log('\nVerifying baseMint ownership...');
        const baseMintInfo = await connection.getAccountInfo(baseMint);
        if (!baseMintInfo) throw new Error('baseMint not found');
        const baseMintProgram = baseMintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        console.log('baseMint owner:', baseMintInfo.owner.toString(), 'Using program:', baseMintProgram.toString());

        // Rent exemptions
        const POOL_STATE_SPACE = 648;
        const poolRentExemption = await connection.getMinimumBalanceForRentExemption(POOL_STATE_SPACE);
        const lpMintRentExemption = await connection.getMinimumBalanceForRentExemption(82);
        const tokenAccountRentExemption = await connection.getMinimumBalanceForRentExemption(165);

        // Check balance
        const balance = await connection.getBalance(authority.publicKey);
        const requiredSol = (poolRentExemption + lpMintRentExemption + 2 * tokenAccountRentExemption) / LAMPORTS_PER_SOL;
        if (balance < requiredSol * LAMPORTS_PER_SOL) {
            throw new Error(`Insufficient SOL: Need ${requiredSol} SOL, have ${balance / LAMPORTS_PER_SOL} SOL`);
        }

        // AMM authority PDA
        const [ammAuthority] = await PublicKey.findProgramAddress(
            [Buffer.from('pool_authority'), poolKeypair.publicKey.toBuffer()],
            RAYDIUM_CLMM_PROGRAM_ID
        );

        // Create LP mint (standard SPL)
        const createLpMintIx = SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: lpMintKeypair.publicKey,
            lamports: lpMintRentExemption,
            space: 82,
            programId: TOKEN_PROGRAM_ID,
        });
        const initLpMintIx = createInitializeMintInstruction(
            lpMintKeypair.publicKey,
            6,
            authority.publicKey,
            authority.publicKey,
            TOKEN_PROGRAM_ID
        );

        // Create base token vault (dynamic based on baseMint)
        const createBaseTokenIx = SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: baseTokenAccountKeypair.publicKey,
            lamports: tokenAccountRentExemption,
            space: 165,
            programId: baseMintProgram,
        });
        const initBaseTokenIx = createInitializeAccountInstruction(
            baseTokenAccountKeypair.publicKey,
            baseMint,
            ammAuthority,
            baseMintProgram
        );

        // Create quote token vault (standard SPL)
        const createQuoteTokenIx = SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: quoteTokenAccountKeypair.publicKey,
            lamports: tokenAccountRentExemption,
            space: 165,
            programId: TOKEN_PROGRAM_ID,
        });
        const initQuoteTokenIx = createInitializeAccountInstruction(
            quoteTokenAccountKeypair.publicKey,
            quoteMint,
            ammAuthority,
            TOKEN_PROGRAM_ID
        );

        // Create pool state
        const createPoolAccountIx = SystemProgram.createAccount({
            fromPubkey: authority.publicKey,
            newAccountPubkey: poolKeypair.publicKey,
            lamports: poolRentExemption,
            space: POOL_STATE_SPACE,
            programId: RAYDIUM_CLMM_PROGRAM_ID,
        });

        // Initial price and tick spacing
        const initialTick = 0;
        const tickSpacing = 60;
        if (initialTick < MIN_TICK || initialTick > MAX_TICK || tickSpacing < MIN_TICK_SPACING || tickSpacing > MAX_TICK_SPACING) {
            throw new Error('Invalid tick or tickSpacing');
        }

        // CreatePool instruction data
        const createPoolData = Buffer.alloc(CREATE_POOL_IX_DATA_LAYOUT.span);
        CREATE_POOL_IX_DATA_LAYOUT.encode({
            instruction: 0,    // create_pool instruction index
            tick: initialTick,
            tickSpacing,
        }, createPoolData);

        // CreatePool instruction
        const createPoolIx = new TransactionInstruction({
            programId: RAYDIUM_CLMM_PROGRAM_ID,
            keys: [
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },           // 0: Standard Token Program
                { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },     // 1: Token-2022 Program
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },   // 2: System Program
                { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },        // 3: Rent Sysvar
                { pubkey: authority.publicKey, isSigner: true, isWritable: true },         // 4: Creator
                { pubkey: poolKeypair.publicKey, isSigner: false, isWritable: true },      // 5: Pool state
                { pubkey: ammAuthority, isSigner: false, isWritable: false },              // 6: Pool authority
                { pubkey: lpMintKeypair.publicKey, isSigner: false, isWritable: true },    // 7: LP mint
                { pubkey: baseMint, isSigner: false, isWritable: false },                  // 8: Base mint
                { pubkey: quoteMint, isSigner: false, isWritable: false },                 // 9: Quote mint
                { pubkey: baseTokenAccountKeypair.publicKey, isSigner: false, isWritable: true }, // 10: Base vault
                { pubkey: quoteTokenAccountKeypair.publicKey, isSigner: false, isWritable: true }, // 11: Quote vault
                { pubkey: AMM_CONFIG_ID, isSigner: false, isWritable: false },             // 12: AMM config
            ],
            data: createPoolData
        });

        // Debug logging before Transaction 1
        console.log('\nPre-Transaction 1 Debug Info:');
        console.log('LP Mint Program:', TOKEN_PROGRAM_ID.toString());
        console.log('Base Token Program:', baseMintProgram.toString());
        console.log('Quote Token Program:', TOKEN_PROGRAM_ID.toString());

        // Transaction 1: Create accounts
        console.log('\nSending Transaction 1: Creating accounts...');
        const setupTx1 = new Transaction()
            .add(createLpMintIx)
            .add(initLpMintIx)
            .add(createBaseTokenIx)
            .add(initBaseTokenIx)
            .add(createQuoteTokenIx)
            .add(initQuoteTokenIx);
        await checkTransactionSize(setupTx1, connection, authority.publicKey);
        await sendAndConfirmTransactionWithRetry(
            connection,
            setupTx1,
            [authority, lpMintKeypair, baseTokenAccountKeypair, quoteTokenAccountKeypair],
            'Transaction 1'
        );

        // Verify accounts
        console.log('\nVerifying accounts...');
        const lpMintInfo = await connection.getAccountInfo(lpMintKeypair.publicKey);
        if (!lpMintInfo || !lpMintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            throw new Error('LP Mint verification failed');
        }
        const baseVaultInfo = await connection.getAccountInfo(baseTokenAccountKeypair.publicKey);
        if (!baseVaultInfo || !baseVaultInfo.owner.equals(baseMintProgram)) {
            throw new Error('Base Vault verification failed');
        }
        const quoteVaultInfo = await connection.getAccountInfo(quoteTokenAccountKeypair.publicKey);
        if (!quoteVaultInfo || !quoteVaultInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            throw new Error('Quote Vault verification failed');
        }

        // Transaction 2: Create and initialize pool
        console.log('\nSending Transaction 2: Creating and initializing pool...');
        const setupTx2 = new Transaction()
            .add(createPoolAccountIx)
            .add(createPoolIx);
        await checkTransactionSize(setupTx2, connection, authority.publicKey);
        await sendAndConfirmTransactionWithRetry(
            connection,
            setupTx2,
            [authority, poolKeypair],
            'Transaction 2'
        );

        // Update config
        const configPath = path.join(__dirname, '../config.mainnet.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.raydiumClmm = {
            poolId: poolKeypair.publicKey.toString(),
            lpMint: lpMintKeypair.publicKey.toString(),
            baseVault: baseTokenAccountKeypair.publicKey.toString(),
            quoteVault: quoteTokenAccountKeypair.publicKey.toString(),
            ammAuthority: ammAuthority.toString(),
            initialTick,
            tickSpacing
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

        console.log('\nRaydium CLMM pool created successfully!');
        console.log('Pool ID:', poolKeypair.publicKey.toString());
        console.log('LP Mint:', lpMintKeypair.publicKey.toString());
        console.log('Base Vault:', baseTokenAccountKeypair.publicKey.toString());
        console.log('Quote Vault:', quoteTokenAccountKeypair.publicKey.toString());
        console.log('AMM Authority:', ammAuthority.toString());
        console.log('Initial Tick:', initialTick);
        console.log('Tick Spacing:', tickSpacing);
        console.log('\nNext steps:');
        console.log('1. Run initialize_tick_arrays.js to set up tick arrays');
        console.log('2. Run add_initial_liquidity.js to provide liquidity');

    } catch (error) {
        console.error('\nError creating Raydium CLMM pool:', error);
        if (connection && authority) {
            await cleanupAccounts(connection, authority, accountsToCleanup);
        }
        process.exit(1);
    }
}

createRaydiumClmmPool(); 
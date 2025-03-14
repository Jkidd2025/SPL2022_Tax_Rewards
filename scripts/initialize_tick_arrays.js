const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { struct, u8, i32, u16 } = require('@project-serum/borsh');
const BN = require('bn.js');
const fs = require('fs');
const path = require('path');
const { ComputeBudgetProgram } = require('@solana/web3.js');
require('dotenv').config();

// Raydium Program ID
const RAYDIUM_PROGRAM_ID = new PublicKey('CAMMCzo5eU8LuqYDRXBnpsmuSWzk8VVRterB9nyaKifZ');

// Constants
const MAX_RETRIES = 5;
const CONFIRMATION_TIMEOUT = 60; // 60 seconds
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 32000;
const TRANSACTION_SPACING_MS = 5000; // 5 seconds between transactions

// Layout for the InitializeTickArray instruction data
const INITIALIZE_TICK_ARRAY_IX_DATA_LAYOUT = struct([
    u8('instruction'),
    i32('startTickIndex'),
    u16('tickSpacing'),
]);

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
            
            if (!transaction.instructions.some(ix => 
                ix.programId.equals(ComputeBudgetProgram.programId) && 
                ix.data[0] === 3
            )) {
                transaction.instructions = [
                    ComputeBudgetProgram.setComputeUnitPrice({
                        microLamports: 50000
                    }),
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
            
            let confirmed = false;
            backoff = INITIAL_BACKOFF_MS;
            
            while (!confirmed && backoff <= MAX_BACKOFF_MS) {
                try {
                    await connection.confirmTransaction({
                        signature,
                        blockhash,
                        lastValidBlockHeight
                    }, 'confirmed');
                    confirmed = true;
                } catch (error) {
                    if (error.message.includes('429 Too Many Requests')) {
                        console.log(`Rate limited during confirmation, waiting ${backoff/1000} seconds...`);
                        await sleep(backoff);
                        backoff *= 2;
                        continue;
                    }
                    throw error;
                }
            }
            
            if (!confirmed) {
                throw new Error('Transaction confirmation timed out');
            }
            
            console.log(`${label} confirmed!`);
            console.log(`Waiting ${TRANSACTION_SPACING_MS/1000} seconds before next transaction...`);
            await sleep(TRANSACTION_SPACING_MS);
            
            return signature;
        } catch (error) {
            console.log(`\n${label} attempt ${i + 1} failed:`);
            console.error('Error message:', error.message);
            
            if (error.logs) {
                console.error('\nTransaction Logs:');
                error.logs.forEach((log, index) => {
                    console.error(`${index + 1}. ${log}`);
                });
            }
            
            lastError = error;
            
            if (error.message.includes('429 Too Many Requests')) {
                console.log(`Rate limited, waiting ${backoff/1000} seconds before retry...`);
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            } else {
                await sleep(2000);
            }
            
            const { blockhash } = await getRecentBlockhashWithRetry(connection);
            transaction.recentBlockhash = blockhash;
        }
    }
    throw new Error(`Failed to send ${label} after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

async function initializeTickArrays() {
    try {
        console.log('Initializing tick arrays for Raydium CLMM pool...\n');

        // Load authority wallet
        const authority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );

        // Connect to mainnet
        const connection = new Connection(
            process.env.SOLANA_RPC_ENDPOINT,
            {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: CONFIRMATION_TIMEOUT * 1000
            }
        );

        // Load pool information from config
        const configPath = path.join(__dirname, '../config.mainnet.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const poolId = new PublicKey(config.raydium.ammId);

        // Get AMM authority PDA
        const [ammAuthority] = await PublicKey.findProgramAddress(
            [poolId.toBuffer()],
            RAYDIUM_PROGRAM_ID
        );

        // Calculate tick array parameters
        const tickSpacing = 60; // ~0.6% increments
        const ticksPerArray = 64; // Standard size for tick arrays
        const numArrays = 10; // Number of tick arrays to initialize (5 positive, 5 negative)

        // Calculate required SOL for tick arrays
        const tickArraySpace = 1024; // Standard size for tick array account
        const tickArrayRent = await connection.getMinimumBalanceForRentExemption(tickArraySpace);
        const totalRequiredSol = (tickArrayRent * numArrays) / LAMPORTS_PER_SOL;

        // Check wallet balance
        const balance = await connection.getBalance(authority.publicKey);
        console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`Required SOL for tick arrays: ${totalRequiredSol} SOL`);

        if (balance < tickArrayRent * numArrays) {
            throw new Error(`Insufficient SOL balance. Need ${totalRequiredSol} SOL but have ${balance / LAMPORTS_PER_SOL} SOL`);
        }

        // Create tick array accounts
        const tickArrayKeypairs = [];
        const createTickArrayIxs = [];

        for (let i = 0; i < numArrays; i++) {
            const tickArrayKeypair = Keypair.generate();
            tickArrayKeypairs.push(tickArrayKeypair);

            const createTickArrayIx = SystemProgram.createAccount({
                fromPubkey: authority.publicKey,
                newAccountPubkey: tickArrayKeypair.publicKey,
                lamports: tickArrayRent,
                space: tickArraySpace,
                programId: RAYDIUM_PROGRAM_ID,
            });

            createTickArrayIxs.push(createTickArrayIx);
        }

        // Initialize tick arrays
        const initializeTickArrayIxs = tickArrayKeypairs.map((keypair, index) => {
            // Calculate start tick index
            // For positive ticks: 0, 64, 128, 192, 256
            // For negative ticks: -64, -128, -192, -256, -320
            const startTickIndex = index < 5 ? 
                index * ticksPerArray : 
                -(index - 4) * ticksPerArray;

            const initializeData = Buffer.alloc(INITIALIZE_TICK_ARRAY_IX_DATA_LAYOUT.span);
            INITIALIZE_TICK_ARRAY_IX_DATA_LAYOUT.encode(
                {
                    instruction: 1, // InitializeTickArray instruction
                    startTickIndex,
                    tickSpacing,
                },
                initializeData
            );

            return new TransactionInstruction({
                programId: RAYDIUM_PROGRAM_ID,
                keys: [
                    { pubkey: poolId, isSigner: false, isWritable: true },
                    { pubkey: keypair.publicKey, isSigner: false, isWritable: true },
                    { pubkey: ammAuthority, isSigner: false, isWritable: false },
                ],
                data: initializeData
            });
        });

        // Send transactions in batches to avoid size limits
        const BATCH_SIZE = 4;
        for (let i = 0; i < numArrays; i += BATCH_SIZE) {
            const batchSize = Math.min(BATCH_SIZE, numArrays - i);
            const batchTx = new Transaction();

            // Add create account instructions
            for (let j = 0; j < batchSize; j++) {
                batchTx.add(createTickArrayIxs[i + j]);
            }

            // Add initialize instructions
            for (let j = 0; j < batchSize; j++) {
                batchTx.add(initializeTickArrayIxs[i + j]);
            }

            console.log(`\nSending batch ${Math.floor(i/BATCH_SIZE) + 1}...`);
            await sendAndConfirmTransactionWithRetry(
                connection,
                batchTx,
                [authority, ...tickArrayKeypairs.slice(i, i + batchSize)],
                `Batch ${Math.floor(i/BATCH_SIZE) + 1}`
            );
        }

        // Verify tick arrays
        console.log('\nVerifying tick arrays...');
        for (const keypair of tickArrayKeypairs) {
            const accountInfo = await connection.getAccountInfo(keypair.publicKey);
            console.log(`Tick Array ${keypair.publicKey.toString()}:`, {
                exists: !!accountInfo,
                owner: accountInfo?.owner.toString(),
                dataLength: accountInfo?.data.length,
            });
        }

        // Save tick array information to config
        config.raydium.tickArrays = tickArrayKeypairs.map(kp => kp.publicKey.toString());
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

        console.log('\nTick arrays initialized successfully!');
        console.log('\nTick Array Information:');
        tickArrayKeypairs.forEach((keypair, index) => {
            const startTickIndex = index < 5 ? 
                index * ticksPerArray : 
                -(index - 4) * ticksPerArray;
            console.log(`Tick Array ${index + 1}:`, {
                address: keypair.publicKey.toString(),
                startTickIndex,
                tickSpacing,
            });
        });

    } catch (error) {
        console.error('Error initializing tick arrays:', error);
        throw error;
    }
}

initializeTickArrays(); 
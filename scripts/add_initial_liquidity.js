const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } = require('@solana/spl-token');
const { struct, u64, u8, i32 } = require('@project-serum/borsh');
const BN = require('bn.js');
const fs = require('fs');
require('dotenv').config();

// Raydium Program ID
const RAYDIUM_PROGRAM_ID = new PublicKey('CAMMCzo5eU8LuqYDRXBnpsmuSWzk8VVRterB9nyaKifZ');

// USDC mint address
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Initial liquidity parameters
const INITIAL_LIQUIDITY = {
    coinAmount: new BN('100000000000'), // 100,000 BPAY (6 decimals)
    pcAmount: new BN('10000000'),       // 10 USDC (6 decimals)
    tickLower: -60,                     // Lower tick bound (-0.6%)
    tickUpper: 60,                      // Upper tick bound (+0.6%)
};

// Layout for the OpenPosition instruction data
const OPEN_POSITION_IX_DATA_LAYOUT = struct([
    u8('instruction'),
    i32('tickLowerIndex'),
    i32('tickUpperIndex'),
    u64('liquidity'),
    u64('amount0Max'),
    u64('amount1Max'),
]);

async function checkTokenBalances(connection, owner, baseMint, quoteMint) {
    console.log('\nChecking token balances...');

    // Get associated token accounts
    const baseATA = await getAssociatedTokenAddress(baseMint, owner);
    const quoteATA = await getAssociatedTokenAddress(quoteMint, owner);

    // Get account infos
    const [baseInfo, quoteInfo] = await Promise.all([
        connection.getAccountInfo(baseATA),
        connection.getAccountInfo(quoteATA)
    ]);

    if (!baseInfo) {
        throw new Error('Base token (BPAY) account not found. Please create and fund it first.');
    }
    if (!quoteInfo) {
        throw new Error('Quote token (USDC) account not found. Please create and fund it first.');
    }

    // Parse token amounts
    const baseAmount = struct([['amount', u64]]).decode(baseInfo.data.slice(64, 72)).amount;
    const quoteAmount = struct([['amount', u64]]).decode(quoteInfo.data.slice(64, 72)).amount;

    console.log('\nCurrent balances:');
    console.log('BPAY:', (baseAmount.toNumber() / 1e6).toFixed(6), 'BPAY');
    console.log('USDC:', (quoteAmount.toNumber() / 1e6).toFixed(2), 'USDC');

    // Check if balances are sufficient
    if (baseAmount.lt(INITIAL_LIQUIDITY.coinAmount)) {
        throw new Error(`Insufficient BPAY balance. Need ${(INITIAL_LIQUIDITY.coinAmount.toNumber() / 1e6).toFixed(6)} but have ${(baseAmount.toNumber() / 1e6).toFixed(6)}`);
    }
    if (quoteAmount.lt(INITIAL_LIQUIDITY.pcAmount)) {
        throw new Error(`Insufficient USDC balance. Need ${(INITIAL_LIQUIDITY.pcAmount.toNumber() / 1e6).toFixed(2)} but have ${(quoteAmount.toNumber() / 1e6).toFixed(2)}`);
    }

    return { baseATA, quoteATA, baseAmount, quoteAmount };
}

async function addInitialLiquidity() {
    try {
        console.log('Adding initial liquidity to Raydium CLMM pool...');

        // Load authority wallet
        const authority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );

        // Connect to mainnet
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, 'confirmed');

        // Load config
        const config = JSON.parse(fs.readFileSync('config.mainnet.json'));
        if (!config.raydium || !config.raydium.ammId) {
            throw new Error('Raydium pool information not found in config.mainnet.json');
        }

        const baseMint = new PublicKey(config.token.mint);
        const poolId = new PublicKey(config.raydium.ammId);
        const poolState = await connection.getAccountInfo(poolId);
        
        if (!poolState) {
            throw new Error('Pool state account not found. Make sure the pool is created correctly.');
        }

        // Get AMM authority PDA
        const [ammAuthority] = await PublicKey.findProgramAddress(
            [poolId.toBuffer()],
            RAYDIUM_PROGRAM_ID
        );

        // Check token balances
        const { baseATA, quoteATA } = await checkTokenBalances(
            connection,
            authority.publicKey,
            baseMint,
            USDC_MINT
        );

        // Calculate liquidity amount
        // For CLMM, we need to calculate the liquidity based on the amounts and price range
        const sqrtPriceLower = Math.sqrt(1.006); // Price at lower tick (-0.6%)
        const sqrtPriceUpper = Math.sqrt(1.006); // Price at upper tick (+0.6%)
        const liquidity = new BN(
            Math.floor(
                (INITIAL_LIQUIDITY.coinAmount.toNumber() * (sqrtPriceUpper - sqrtPriceLower)) /
                (sqrtPriceUpper * sqrtPriceLower)
            )
        );

        // Create open position instruction
        console.log('\nOpening liquidity position...');
        console.log('Base Amount:', (INITIAL_LIQUIDITY.coinAmount.toNumber() / 1e6).toFixed(6), 'BPAY');
        console.log('Quote Amount:', (INITIAL_LIQUIDITY.pcAmount.toNumber() / 1e6).toFixed(2), 'USDC');
        console.log('Price Range:', `${INITIAL_LIQUIDITY.tickLower} to ${INITIAL_LIQUIDITY.tickUpper}`);

        const openPositionData = Buffer.alloc(OPEN_POSITION_IX_DATA_LAYOUT.span);
        OPEN_POSITION_IX_DATA_LAYOUT.encode(
            {
                instruction: 2, // OpenPosition instruction
                tickLowerIndex: INITIAL_LIQUIDITY.tickLower,
                tickUpperIndex: INITIAL_LIQUIDITY.tickUpper,
                liquidity: liquidity,
                amount0Max: INITIAL_LIQUIDITY.coinAmount,
                amount1Max: INITIAL_LIQUIDITY.pcAmount,
            },
            openPositionData
        );

        // Get tick array accounts from config
        if (!config.raydium.tickArrays || config.raydium.tickArrays.length === 0) {
            throw new Error('Tick arrays not found in config. Please run initialize_tick_arrays.js first.');
        }

        // Find the tick arrays that contain our price range
        const tickArrays = config.raydium.tickArrays.map(addr => new PublicKey(addr));
        const lowerTickArray = tickArrays.find(addr => {
            const startTick = parseInt(addr.toString().slice(-8), 16);
            return startTick <= INITIAL_LIQUIDITY.tickLower && startTick + 64 > INITIAL_LIQUIDITY.tickLower;
        });
        const upperTickArray = tickArrays.find(addr => {
            const startTick = parseInt(addr.toString().slice(-8), 16);
            return startTick <= INITIAL_LIQUIDITY.tickUpper && startTick + 64 > INITIAL_LIQUIDITY.tickUpper;
        });

        if (!lowerTickArray || !upperTickArray) {
            throw new Error('Could not find tick arrays for the specified price range');
        }

        const openPositionIx = new TransactionInstruction({
            programId: RAYDIUM_PROGRAM_ID,
            keys: [
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: poolId, isSigner: false, isWritable: true },
                { pubkey: authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: new PublicKey(config.raydium.baseTokenAccount), isSigner: false, isWritable: true },
                { pubkey: new PublicKey(config.raydium.quoteTokenAccount), isSigner: false, isWritable: true },
                { pubkey: new PublicKey(config.raydium.lpMint), isSigner: false, isWritable: true },
                { pubkey: baseATA, isSigner: false, isWritable: true },
                { pubkey: quoteATA, isSigner: false, isWritable: true },
                { pubkey: new PublicKey(config.raydium.lpTokenAccount), isSigner: false, isWritable: true },
                { pubkey: lowerTickArray, isSigner: false, isWritable: true },
                { pubkey: upperTickArray, isSigner: false, isWritable: true },
                { pubkey: ammAuthority, isSigner: false, isWritable: false },
            ],
            data: openPositionData,
        });

        // Send transaction
        const tx = new Transaction()
            .add(openPositionIx);

        const signature = await connection.sendTransaction(tx, [authority], {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });

        console.log('\nLiquidity position opened:', signature);
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('Transaction confirmed!');

        console.log('\nInitial liquidity added successfully!');
        console.log('\nNext steps:');
        console.log('1. Wait for the position to be fully initialized');
        console.log('2. Trading will be enabled automatically');

    } catch (error) {
        console.error('\nError adding initial liquidity:', error);
        process.exit(1);
    }
}

addInitialLiquidity(); 
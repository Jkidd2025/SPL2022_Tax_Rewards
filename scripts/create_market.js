const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { DexInstructions } = require('@project-serum/serum');
const { TOKEN_PROGRAM_ID, AccountLayout, createInitializeAccountInstruction } = require('@solana/spl-token');
const BN = require('bn.js');
const fs = require('fs');
require('dotenv').config();

// Market configuration
const MARKET_CONFIG = {
    // Base token is our token
    baseMint: new PublicKey('DVSSBXY2Kvpt7nmPRfbY9JNdgMnm8y6TvkkwoZiVQUiv'),
    // USDC is the quote currency
    quoteMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC mint
    // Base lot size is the smallest amount of base token that can be traded
    baseLotSize: new BN(100000), // 0.1 token (6 decimals)
    // Quote lot size is the smallest amount of USDC that can be traded
    quoteLotSize: new BN(1000), // 0.001 USDC (USDC has 6 decimals)
    // Minimum allowed price increment
    tickSize: new BN(1000), // 0.001 USDC
    // Initial fees and thresholds
    pcDustThreshold: new BN(1000), // 0.001 USDC
    baseDustThreshold: new BN(100000), // 0.1 token
    feeRateBps: 0, // 0% fee initially
};

// OpenBook DEX program ID
const DEX_PID = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');

// Add compute budget instruction to handle larger initialization
const COMPUTE_BUDGET = 1_400_000; // 1.4M compute units

async function sendAndConfirmTransaction(connection, transaction, signers, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            // Add compute budget instruction
            const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: COMPUTE_BUDGET,
            });
            transaction.instructions.unshift(computeBudgetIx);

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = signers[0].publicKey;
            
            // Clear any previous signatures
            transaction.signatures = [];
            
            // Sign fresh
            transaction.sign(...signers);

            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: true, // Skip preflight to handle larger transactions
                preflightCommitment: 'confirmed',
            });

            await connection.confirmTransaction(signature, 'confirmed');
            console.log('Transaction confirmed:', signature);
            return signature;
        } catch (error) {
            console.error('Transaction error:', error);
            if (i === retries - 1) throw error;
            console.log(`Retrying transaction... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay between retries
        }
    }
}

async function createSingleAccount(connection, marketAuthority, newAccountKeypair, space, programId, rent) {
    console.log(`Creating account ${newAccountKeypair.publicKey.toString()}...`);
    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: marketAuthority.publicKey,
            newAccountPubkey: newAccountKeypair.publicKey,
            lamports: rent,
            space: space,
            programId: programId,
        })
    );
    await sendAndConfirmTransaction(connection, transaction, [marketAuthority, newAccountKeypair]);
}

async function findVaultOwnerAndNonce(marketKey, dexPid) {
    const nonce = new BN(0);
    while (nonce.toNumber() < 255) {
        try {
            const [vaultOwner, _nonce] = await PublicKey.findProgramAddress(
                [marketKey.toBuffer()],
                dexPid
            );
            return [vaultOwner, _nonce];
        } catch (e) {
            nonce.iaddn(1);
        }
    }
    throw new Error('Unable to find nonce');
}

async function checkBalanceAndRequirements(connection, marketAuthority) {
    console.log('\nChecking wallet balance and SOL requirements...');
    
    // Calculate account sizes
    const MARKET_STATE_LAYOUT_V2_LEN = 388;
    const TOKEN_ACCOUNT_SIZE = AccountLayout.span;
    const REQ_Q_LEN = 5132;
    const EVENT_Q_LEN = 262156;
    const BIDS_ASKS_LEN = 65536;

    // Get minimum balances for rent exemption
    const marketRent = await connection.getMinimumBalanceForRentExemption(MARKET_STATE_LAYOUT_V2_LEN);
    const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
    const reqQRent = await connection.getMinimumBalanceForRentExemption(REQ_Q_LEN);
    const eventQRent = await connection.getMinimumBalanceForRentExemption(EVENT_Q_LEN);
    const bidsRent = await connection.getMinimumBalanceForRentExemption(BIDS_ASKS_LEN);

    // Calculate total required SOL
    const totalRequired = (
        marketRent +                 // Market account
        (2 * tokenAccountRent) +     // Base and quote vaults
        (2 * bidsRent) +            // Bids and asks accounts
        reqQRent +                  // Request queue
        eventQRent +                // Event queue
        (0.01 * 1e9)                // Buffer for transaction fees (0.01 SOL)
    ) / 1e9;  // Convert lamports to SOL

    // Check current balance
    const balance = await connection.getBalance(marketAuthority.publicKey) / 1e9;
    
    console.log('\nSOL Requirements:');
    console.log('Market Account:     ', (marketRent / 1e9).toFixed(9), 'SOL');
    console.log('Token Vaults (2x):  ', ((2 * tokenAccountRent) / 1e9).toFixed(9), 'SOL');
    console.log('Order Books (2x):   ', ((2 * bidsRent) / 1e9).toFixed(9), 'SOL');
    console.log('Request Queue:      ', (reqQRent / 1e9).toFixed(9), 'SOL');
    console.log('Event Queue:        ', (eventQRent / 1e9).toFixed(9), 'SOL');
    console.log('Transaction Buffer: ', '0.01', 'SOL');
    console.log('Total Required:     ', totalRequired.toFixed(9), 'SOL');
    console.log('Current Balance:    ', balance.toFixed(9), 'SOL');

    if (balance < totalRequired) {
        throw new Error(`Insufficient SOL balance. Need ${totalRequired.toFixed(4)} SOL but have ${balance.toFixed(4)} SOL. Please fund wallet address: ${marketAuthority.publicKey.toString()}`);
    }

    return true;
}

async function createMarket() {
    try {
        console.log('Creating new Serum/OpenBook market for BPAY/USDC...\n');

        // Connect to Helius RPC with fallback
        const heliusApiKey = process.env.HELIUS_API_KEY;
        let rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT;
        
        if (!heliusApiKey) {
            console.warn('Warning: HELIUS_API_KEY not found in environment variables');
            rpcEndpoint = process.env.SOLANA_RPC_ENDPOINT_BACKUP;
        } else {
            rpcEndpoint = rpcEndpoint.replace('${HELIUS_API_KEY}', heliusApiKey);
        }

        // Initialize connection
        const connection = new Connection(rpcEndpoint, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000
        });

        // Load market authority wallet
        const marketAuthority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );

        // Check balance and requirements first
        await checkBalanceAndRequirements(connection, marketAuthority);

        // Load BPAY token mint from config
        const config = JSON.parse(fs.readFileSync('config.mainnet.json'));
        if (!config.tokens.base.mint) {
            throw new Error('Base token mint address not found in config.mainnet.json');
        }
        const baseMint = new PublicKey(config.tokens.base.mint);

        // Generate market and vault owner keypairs
        const marketKeypair = Keypair.generate();
        const baseVault = Keypair.generate();
        const quoteVault = Keypair.generate();
        const bidsKeypair = Keypair.generate();
        const asksKeypair = Keypair.generate();
        const requestQueueKeypair = Keypair.generate();
        const eventQueueKeypair = Keypair.generate();

        // Find vault owner and nonce
        const [vaultOwner, nonce] = await findVaultOwnerAndNonce(marketKeypair.publicKey, DEX_PID);
        console.log('Vault owner:', vaultOwner.toString());
        console.log('Nonce:', nonce);

        // Calculate account sizes
        const MARKET_STATE_LAYOUT_V2_LEN = 388;
        const TOKEN_ACCOUNT_SIZE = AccountLayout.span;
        const REQ_Q_LEN = 5132;
        const EVENT_Q_LEN = 262156;
        const BIDS_ASKS_LEN = 65536;

        // Get minimum balances for rent exemption
        const marketRent = await connection.getMinimumBalanceForRentExemption(MARKET_STATE_LAYOUT_V2_LEN);
        const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
        const reqQRent = await connection.getMinimumBalanceForRentExemption(REQ_Q_LEN);
        const eventQRent = await connection.getMinimumBalanceForRentExemption(EVENT_Q_LEN);
        const bidsRent = await connection.getMinimumBalanceForRentExemption(BIDS_ASKS_LEN);
        const asksRent = await connection.getMinimumBalanceForRentExemption(BIDS_ASKS_LEN);

        // Create accounts one by one
        await createSingleAccount(connection, marketAuthority, marketKeypair, MARKET_STATE_LAYOUT_V2_LEN, DEX_PID, marketRent);
        await createSingleAccount(connection, marketAuthority, baseVault, TOKEN_ACCOUNT_SIZE, TOKEN_PROGRAM_ID, tokenAccountRent);
        await createSingleAccount(connection, marketAuthority, quoteVault, TOKEN_ACCOUNT_SIZE, TOKEN_PROGRAM_ID, tokenAccountRent);
        await createSingleAccount(connection, marketAuthority, bidsKeypair, BIDS_ASKS_LEN, DEX_PID, bidsRent);
        await createSingleAccount(connection, marketAuthority, asksKeypair, BIDS_ASKS_LEN, DEX_PID, asksRent);
        await createSingleAccount(connection, marketAuthority, requestQueueKeypair, REQ_Q_LEN, DEX_PID, reqQRent);
        await createSingleAccount(connection, marketAuthority, eventQueueKeypair, EVENT_Q_LEN, DEX_PID, eventQRent);

        // Initialize token vaults
        console.log('Initializing token vaults...');
        
        // Initialize base token vault
        console.log('Initializing base token vault...');
        const initBaseVaultIx = createInitializeAccountInstruction(
            baseVault.publicKey,
            baseMint,
            vaultOwner,
            TOKEN_PROGRAM_ID
        );

        const initBaseVaultTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: marketAuthority.publicKey,
                toPubkey: baseVault.publicKey,
                lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span),
            }),
            initBaseVaultIx
        );
        await sendAndConfirmTransaction(connection, initBaseVaultTx, [marketAuthority, baseVault]);

        // Initialize quote token vault
        console.log('Initializing quote token vault...');
        const initQuoteVaultIx = createInitializeAccountInstruction(
            quoteVault.publicKey,
            MARKET_CONFIG.quoteMint,
            vaultOwner,
            TOKEN_PROGRAM_ID
        );

        const initQuoteVaultTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: marketAuthority.publicKey,
                toPubkey: quoteVault.publicKey,
                lamports: await connection.getMinimumBalanceForRentExemption(AccountLayout.span),
            }),
            initQuoteVaultIx
        );
        await sendAndConfirmTransaction(connection, initQuoteVaultTx, [marketAuthority, quoteVault]);

        // Initialize market
        console.log('Initializing market...');
        const initializeMarketIx = DexInstructions.initializeMarket({
            market: marketKeypair.publicKey,
            requestQueue: requestQueueKeypair.publicKey,
            eventQueue: eventQueueKeypair.publicKey,
            bids: bidsKeypair.publicKey,
            asks: asksKeypair.publicKey,
            baseVault: baseVault.publicKey,
            quoteVault: quoteVault.publicKey,
            baseMint,
            quoteMint: MARKET_CONFIG.quoteMint,
            baseLotSize: MARKET_CONFIG.baseLotSize,
            quoteLotSize: MARKET_CONFIG.quoteLotSize,
            feeRateBps: MARKET_CONFIG.feeRateBps,
            vaultSignerNonce: new BN(nonce),
            quoteDustThreshold: MARKET_CONFIG.pcDustThreshold,
            baseDustThreshold: MARKET_CONFIG.baseDustThreshold,
            programId: DEX_PID,
            authority: marketAuthority.publicKey,
            pruneAuthority: marketAuthority.publicKey,
            crankAuthority: marketAuthority.publicKey,
        });

        const initializeMarketTx = new Transaction().add(initializeMarketIx);
        await sendAndConfirmTransaction(connection, initializeMarketTx, [marketAuthority]);

        console.log('\nMarket created successfully!');
        console.log('Market ID:', marketKeypair.publicKey.toString());
        
        // Update config with market ID
        config.raydium.marketId = marketKeypair.publicKey.toString();
        fs.writeFileSync('config.mainnet.json', JSON.stringify(config, null, 4));
        console.log('\nConfig updated with market ID');

        // Print market parameters
        console.log('\nMarket Parameters:');
        console.log('Base Token (BPAY):', baseMint.toString());
        console.log('Quote Token (USDC):', MARKET_CONFIG.quoteMint.toString());
        console.log('Base Lot Size:', MARKET_CONFIG.baseLotSize.toString(), '(0.1 token)');
        console.log('Quote Lot Size:', MARKET_CONFIG.quoteLotSize.toString(), '(0.001 USDC)');
        console.log('Tick Size:', MARKET_CONFIG.tickSize.toString(), '(0.001 USDC)');
        console.log('Initial Fee Rate:', MARKET_CONFIG.feeRateBps, 'bps');
        console.log('Total Supply: 1,000,000,000 BPAY');

    } catch (error) {
        console.error('\nError creating market:', error);
        process.exit(1);
    }
}

createMarket(); 
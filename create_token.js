const { Connection } = require('@solana/web3.js');
const TokenManager = require('./src/managers/TokenManager');
const fs = require('fs');
const https = require('https');

async function validateMetadataUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                reject(new Error(`Metadata URL returned status code: ${res.statusCode}`));
            }
        }).on('error', (err) => {
            reject(new Error(`Error validating metadata URL: ${err.message}`));
        });
    });
}

async function retryWithBackoff(operation, maxRetries = 3, initialDelay = 2000) {
    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries}...`);
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === maxRetries) break;
            
            console.log(`Attempt ${attempt} failed: ${error.message}`);
            console.log(`Retrying in ${delay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
    throw lastError;
}

async function main() {
    try {
        // Load and validate configuration
        if (!fs.existsSync('./config.mainnet.json')) {
            throw new Error('config.mainnet.json not found');
        }
        
        const config = JSON.parse(fs.readFileSync('./config.mainnet.json', 'utf-8'));
        
        // Validate config structure
        if (!config.network?.endpoint || !config.wallets?.treasury?.publicKey) {
            throw new Error('Invalid config structure');
        }
        
        // Connect to mainnet with increased timeouts
        const connection = new Connection(config.network.endpoint, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 120000, // 2 minutes
            preflightCommitment: 'confirmed',
            timeout: 120000
        });
        
        // Initialize token manager
        const tokenManager = new TokenManager(connection);

        console.log('Creating BPAY token...');

        // 1. Create token mint with retry
        console.log('\nStep 1: Creating token mint...');
        const mintPubkey = await retryWithBackoff(async () => {
            return await tokenManager.createTokenMint();
        });
        console.log('Token mint created:', mintPubkey.toBase58());

        // 2. Create metadata
        console.log('\nStep 2: Creating token metadata...');
        const metadata = {
            name: config.token.name,
            symbol: config.token.symbol,
            uri: config.token.metadataUri
        };

        // Validate metadata URL before proceeding
        await validateMetadataUrl(metadata.uri);
        console.log('Metadata URL validated successfully');

        const metadataPda = await retryWithBackoff(async () => {
            return await tokenManager.createTokenMetadata(mintPubkey, metadata);
        });
        console.log('Metadata created:', metadataPda.toBase58());

        // 3. Create Treasury token account with retry
        console.log('\nStep 3: Creating Treasury token account...');
        const treasuryPubkey = config.wallets.treasury.publicKey;
        const treasuryATA = await retryWithBackoff(async () => {
            return await tokenManager.createTokenAccount(treasuryPubkey, mintPubkey);
        });
        console.log('Treasury token account created:', treasuryATA.toBase58());

        // 4. Mint initial supply to Treasury with retry
        console.log('\nStep 4: Minting initial supply...');
        const initialSupply = 1_000_000_000; // 1 billion tokens
        await retryWithBackoff(async () => {
            return await tokenManager.mintTo(treasuryATA, initialSupply, mintPubkey);
        });
        console.log('Initial supply minted successfully');

        // Update config with new mint address
        config.token.mint = mintPubkey.toBase58();
        fs.writeFileSync('./config.mainnet.json', JSON.stringify(config, null, 4));
        console.log('\nConfiguration updated with new mint address');

        console.log('\nToken creation completed successfully!');
        console.log('Token Mint Address:', mintPubkey.toBase58());
        console.log('Treasury Token Account:', treasuryATA.toBase58());
        console.log('Metadata Account:', metadataPda.toBase58());

    } catch (error) {
        console.error('\nError creating token:', error);
        process.exit(1);
    }
}

main(); 
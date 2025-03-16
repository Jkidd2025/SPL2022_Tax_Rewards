const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

async function checkTokenAuthorityBalance() {
    try {
        // Load wallet
        const walletPath = 'wallets/mainnet/token-authority.json';

        if (!fs.existsSync(walletPath)) {
            console.error(`\n❌ Wallet file not found at: ${walletPath}`);
            process.exit(1);
        }

        const wallet = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(walletPath)))
        );

        // Connect to network
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, 'confirmed');

        // Get balance
        const balance = await connection.getBalance(wallet.publicKey);
        const balanceInSol = balance / LAMPORTS_PER_SOL;

        console.log('\nToken Authority Wallet');
        console.log('Address:', wallet.publicKey.toString());
        console.log('Balance:', balanceInSol.toFixed(6), 'SOL');

    } catch (error) {
        console.error('Error checking balance:', error);
        process.exit(1);
    }
}

checkTokenAuthorityBalance(); 
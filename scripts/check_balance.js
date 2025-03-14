const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
require('dotenv').config();

async function checkBalance() {
    try {
        const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT);
        const authority = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync('wallets/mainnet/token-authority.json')))
        );
        
        console.log(`Wallet address: ${authority.publicKey.toString()}`);
        const balance = await connection.getBalance(authority.publicKey);
        console.log(`Wallet balance: ${balance / 1e9} SOL`);
        
        // Calculate required SOL for pool creation
        const POOL_STATE_SPACE = 1024;
        const poolStateRent = await connection.getMinimumBalanceForRentExemption(POOL_STATE_SPACE);
        const feeAccountRent = await connection.getMinimumBalanceForRentExemption(165);
        const withdrawQueueRent = await connection.getMinimumBalanceForRentExemption(165);
        const requiredSol = (poolStateRent + feeAccountRent + withdrawQueueRent) / 1e9;
        
        console.log(`\nRequired SOL for pool creation: ${requiredSol} SOL`);
        console.log(`Sufficient balance: ${balance / 1e9 >= requiredSol ? 'Yes' : 'No'}`);
        
    } catch (error) {
        console.error('Error checking balance:', error);
    }
}

checkBalance(); 
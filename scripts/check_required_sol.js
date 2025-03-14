const { Connection } = require('@solana/web3.js');
require('dotenv').config();

async function checkRequiredSol() {
    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, 'confirmed');
    
    // Calculate rent exemption for each account
    const poolStateRent = await connection.getMinimumBalanceForRentExemption(1024); // Pool state
    const openOrdersRent = await connection.getMinimumBalanceForRentExemption(3228); // Open orders
    const targetOrdersRent = await connection.getMinimumBalanceForRentExemption(1024); // Target orders
    
    // Add transaction fees (estimate 0.01 SOL for safety)
    const transactionFees = 10000000;
    
    const totalRequired = poolStateRent + openOrdersRent + targetOrdersRent + transactionFees;
    
    console.log('\nRequired SOL breakdown:');
    console.log('Pool State Account:', poolStateRent / 1e9, 'SOL');
    console.log('Open Orders Account:', openOrdersRent / 1e9, 'SOL');
    console.log('Target Orders Account:', targetOrdersRent / 1e9, 'SOL');
    console.log('Transaction Fees (est):', transactionFees / 1e9, 'SOL');
    console.log('\nTotal Required:', totalRequired / 1e9, 'SOL');
}

checkRequiredSol(); 
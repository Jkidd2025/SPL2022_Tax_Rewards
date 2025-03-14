const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

async function checkPool() {
    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, 'confirmed');
    
    // Pool addresses from config
    const poolId = new PublicKey('DbfQZckLGtWbgKNbijNda5VdNjzeQipVJD7WC6sMJMRS');
    const lpMint = new PublicKey('6qDnrmvGhXVajmaxYmx6CVqUTe6MTtNW4JfzRJgUZXv4');
    const baseTokenAccount = new PublicKey('DipcsdyqHnzUKHujGLqmyJz3Kz5cNRa4JZWqE4sSHzAv');
    const quoteTokenAccount = new PublicKey('9dtst6zrE7BYWLQPnR22o5d8ubxRUKX6ak7iMPPTBicb');
    
    console.log('\nChecking pool accounts...');
    
    // Check pool account
    const poolInfo = await connection.getAccountInfo(poolId);
    console.log('\nPool Account:', poolId.toString());
    console.log('Exists:', !!poolInfo);
    if (poolInfo) {
        console.log('Owner:', poolInfo.owner.toString());
        console.log('Data length:', poolInfo.data.length);
    }
    
    // Check LP mint
    const lpMintInfo = await connection.getAccountInfo(lpMint);
    console.log('\nLP Mint:', lpMint.toString());
    console.log('Exists:', !!lpMintInfo);
    if (lpMintInfo) {
        console.log('Owner:', lpMintInfo.owner.toString());
    }
    
    // Check base token account
    const baseTokenInfo = await connection.getAccountInfo(baseTokenAccount);
    console.log('\nBase Token Account:', baseTokenAccount.toString());
    console.log('Exists:', !!baseTokenInfo);
    if (baseTokenInfo) {
        console.log('Owner:', baseTokenInfo.owner.toString());
    }
    
    // Check quote token account
    const quoteTokenInfo = await connection.getAccountInfo(quoteTokenAccount);
    console.log('\nQuote Token Account:', quoteTokenAccount.toString());
    console.log('Exists:', !!quoteTokenInfo);
    if (quoteTokenInfo) {
        console.log('Owner:', quoteTokenInfo.owner.toString());
    }
}

checkPool(); 
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

async function checkTreasury() {
    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT, 'confirmed');
    const treasuryATA = new PublicKey('2paV19bn5MrK6NKJwjpoNSwxudmBY8JEDsK4xauspPNV');
    
    const accountInfo = await connection.getAccountInfo(treasuryATA);
    console.log('Account Info:', accountInfo);
}

checkTreasury(); 
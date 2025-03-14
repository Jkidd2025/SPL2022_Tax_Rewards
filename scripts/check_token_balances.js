const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

async function checkTokenBalances() {
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    const treasuryAddress = new PublicKey('DPnKM32e59P1ErpveErNxZcgZ1yS71uRdz6488k4sUMh');
    
    const dvsToken = new PublicKey('DVSSBXY2Kvpt7nmPRbY9JNdgMnm8y6TvkkwoZiVQUiv');
    const usdcToken = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    
    console.log('Checking token balances for Treasury wallet:', treasuryAddress.toString());
    
    try {
        // First check SOL balance
        const solBalance = await connection.getBalance(treasuryAddress);
        console.log('\nSOL Balance:', solBalance / 1000000000, 'SOL');

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            treasuryAddress,
            { programId: TOKEN_PROGRAM_ID }
        );
        
        console.log('\nToken Balances:');
        tokenAccounts.value.forEach(account => {
            const parsedInfo = account.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const balance = parsedInfo.tokenAmount.uiAmount;
            
            if (mint === dvsToken.toString()) {
                console.log('\nDVS Token:');
                console.log(`Balance: ${balance} DVS`);
            } else if (mint === usdcToken.toString()) {
                console.log('\nUSDC Token:');
                console.log(`Balance: ${balance} USDC`);
            } else {
                console.log(`\nOther Token (${mint}):`);
                console.log(`Balance: ${balance}`);
            }
        });
    } catch (error) {
        console.error('Error fetching token balances:', error);
    }
}

checkTokenBalances().catch(console.error); 
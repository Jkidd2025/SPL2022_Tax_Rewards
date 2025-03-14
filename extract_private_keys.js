const fs = require('fs');
const path = require('path');

const WALLET_DIR = path.join(__dirname, 'wallets', 'mainnet');
const walletFiles = [
    { file: 'token-authority.json', envKey: 'TOKEN_AUTHORITY_PRIVATE_KEY' },
    { file: 'mint-authority.json', envKey: 'MINT_AUTHORITY_PRIVATE_KEY' },
    { file: 'treasury.json', envKey: 'TREASURY_PRIVATE_KEY' },
    { file: 'tax-collector.json', envKey: 'TAX_COLLECTOR_PRIVATE_KEY' },
    { file: 'rewards-account.json', envKey: 'REWARDS_ACCOUNT_PRIVATE_KEY' }
];

console.log('\nPrivate Keys for .env file:\n');

walletFiles.forEach(({ file, envKey }) => {
    try {
        const filePath = path.join(WALLET_DIR, file);
        const privateKey = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        console.log(`${envKey}="[${privateKey.toString()}]"`);
    } catch (error) {
        console.log(`Error reading ${file}: ${error.message}`);
    }
}); 
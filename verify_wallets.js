const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const WALLET_DIR = path.join(__dirname, 'wallets', 'mainnet');

const walletFiles = [
    'token-authority.json',
    'mint-authority.json',
    'treasury.json',
    'tax-collector.json',
    'rewards-account.json'
];

console.log('\nWallet Public Keys:\n------------------');

walletFiles.forEach(walletFile => {
    const filePath = path.join(WALLET_DIR, walletFile);
    try {
        if (fs.existsSync(filePath)) {
            const keypair = Keypair.fromSecretKey(
                new Uint8Array(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
            );
            console.log(`${walletFile}: ${keypair.publicKey.toString()}`);
        } else {
            console.log(`${walletFile}: ❌ File not found`);
        }
    } catch (error) {
        console.log(`${walletFile}: ❌ Error reading file - ${error.message}`);
    }
}); 
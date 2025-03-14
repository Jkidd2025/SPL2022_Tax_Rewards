const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Read config
const config = JSON.parse(fs.readFileSync('./config.mainnet.json', 'utf-8'));

// Function to verify keypair
function verifyKeypair(walletName, configPublicKey, keypairPath) {
    try {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        const actualPublicKey = keypair.publicKey.toBase58();

        console.log(`\n${walletName}:`);
        console.log('Config Public Key:', configPublicKey);
        console.log('Actual Public Key:', actualPublicKey);
        console.log('Match:', configPublicKey === actualPublicKey);
        
        return {
            walletName,
            configPublicKey,
            actualPublicKey,
            matches: configPublicKey === actualPublicKey
        };
    } catch (error) {
        console.error(`Error verifying ${walletName}:`, error.message);
        return null;
    }
}

// Verify all wallets
const wallets = [
    {
        name: 'Token Authority',
        configKey: config.wallets.tokenAuthority.publicKey,
        path: './wallets/mainnet/token-authority.json'
    },
    {
        name: 'Mint Authority',
        configKey: config.wallets.mintAuthority.publicKey,
        path: './wallets/mainnet/mint-authority.json'
    },
    {
        name: 'Treasury',
        configKey: config.wallets.treasury.publicKey,
        path: './wallets/mainnet/treasury.json'
    },
    {
        name: 'Tax Collector',
        configKey: config.wallets.taxCollector.publicKey,
        path: './wallets/mainnet/tax-collector.json'
    },
    {
        name: 'Rewards Account',
        configKey: config.wallets.rewardsAccount.publicKey,
        path: './wallets/mainnet/rewards-account.json'
    }
];

console.log('Verifying wallet keypairs against config...\n');

const results = wallets.map(wallet => 
    verifyKeypair(wallet.name, wallet.configKey, wallet.path)
);

// Summary
console.log('\n=== Summary ===');
const mismatches = results.filter(r => r && !r.matches);
if (mismatches.length > 0) {
    console.log('\nMismatched wallets:');
    mismatches.forEach(m => {
        console.log(`- ${m.walletName}`);
    });
} else {
    console.log('\nAll wallets match their config entries!');
} 
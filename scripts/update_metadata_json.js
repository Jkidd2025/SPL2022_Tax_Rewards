const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
    try {
        // Create metadata directory if it doesn't exist
        const metadataDir = path.join(process.cwd(), 'assets');
        if (!fs.existsSync(metadataDir)) {
            fs.mkdirSync(metadataDir, { recursive: true });
        }

        // Create new metadata JSON
        const metadata = {
            name: "BPay",
            symbol: "BPAY",
            description: "BPAY is a WBTC payment system that allows users to receive reward payments in WBTC",
            image: "https://raw.githubusercontent.com/Jkidd2025/spl-token-2022-v2/main/assets/logo.png",
            external_url: "https://github.com/Jkidd2025/spl-token-2022-v2",
            attributes: [
                {
                    trait_type: "Decimals",
                    value: 6
                },
                {
                    trait_type: "Token Standard",
                    value: "SPL"
                },
                {
                    trait_type: "Category",
                    value: "Payment Token"
                },
                {
                    trait_type: "Total Supply",
                    value: "1,000,000,000"
                }
            ],
            properties: {
                files: [
                    {
                        uri: "https://raw.githubusercontent.com/Jkidd2025/spl-token-2022-v2/main/assets/logo.png",
                        type: "image/png"
                    }
                ],
                category: "image"
            }
        };

        // Write metadata to file
        const metadataPath = path.join(metadataDir, 'metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log('Metadata file created:', metadataPath);

        // Instructions for manual update
        console.log('\nTo update the metadata on GitHub:');
        console.log('1. Commit the changes:');
        console.log('   git add assets/metadata.json');
        console.log('   git commit -m "Update token metadata to match on-chain BPAY metadata"');
        console.log('2. Push to GitHub:');
        console.log('   git push origin main');
        console.log('\nAfter pushing, the metadata will be available at:');
        console.log('https://raw.githubusercontent.com/Jkidd2025/spl-token-2022-v2/main/assets/metadata.json');

    } catch (error) {
        console.error('Error updating metadata:', error);
        process.exit(1);
    }
}

main(); 
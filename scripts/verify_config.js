const fs = require('fs');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const { log } = require('../src/utils/logger');

class ConfigVerifier {
    constructor(configPath) {
        this.configPath = configPath;
        this.errors = [];
        this.warnings = [];
    }

    async verify() {
        try {
            // Read and parse config
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            
            // Verify each section
            await this.verifyNetwork(config.network);
            await this.verifyWallets(config.wallets);
            await this.verifyToken(config.token);
            await this.verifyWBTC(config.wbtc);
            await this.verifyRaydium(config.raydium);
            await this.verifyRewards(config.rewards);
            
            // Log results
            if (this.errors.length > 0) {
                log.error('Configuration verification failed', {
                    errors: this.errors
                });
                return false;
            }
            
            if (this.warnings.length > 0) {
                log.warn('Configuration verification completed with warnings', {
                    warnings: this.warnings
                });
            }
            
            log.info('Configuration verification completed successfully');
            return true;
        } catch (error) {
            log.error('Failed to verify configuration', error);
            return false;
        }
    }

    async verifyNetwork(network) {
        if (!network) {
            this.errors.push('Missing network configuration');
            return;
        }

        if (!network.endpoint) {
            this.errors.push('Missing network endpoint');
            return;
        }

        if (!network.endpoint.startsWith('https://')) {
            this.warnings.push('Network endpoint should use HTTPS');
        }

        if (!network.alternateEndpoints || network.alternateEndpoints.length === 0) {
            this.warnings.push('No alternate endpoints configured');
        }
    }

    async verifyWallets(wallets) {
        if (!wallets) {
            this.errors.push('Missing wallets configuration');
            return;
        }

        const requiredWallets = [
            'tokenAuthority',
            'mintAuthority',
            'treasury',
            'taxCollector',
            'rewardsAccount'
        ];

        for (const wallet of requiredWallets) {
            if (!wallets[wallet] || !wallets[wallet].publicKey) {
                this.errors.push(`Missing ${wallet} wallet configuration`);
                continue;
            }

            try {
                new PublicKey(wallets[wallet].publicKey);
            } catch (error) {
                this.errors.push(`Invalid public key for ${wallet}`);
            }
        }
    }

    async verifyToken(token) {
        if (!token) {
            this.errors.push('Missing token configuration');
            return;
        }

        try {
            new PublicKey(token.mint);
        } catch (error) {
            this.errors.push('Invalid token mint address');
        }

        if (!token.decimals || token.decimals < 0 || token.decimals > 9) {
            this.errors.push('Invalid token decimals');
        }
    }

    async verifyWBTC(wbtc) {
        if (!wbtc) {
            this.errors.push('Missing WBTC configuration');
            return;
        }

        try {
            new PublicKey(wbtc.mint);
        } catch (error) {
            this.errors.push('Invalid WBTC mint address');
        }

        if (wbtc.decimals !== 8) {
            this.errors.push('WBTC decimals should be 8');
        }

        if (!wbtc.minimumDistributionThreshold || wbtc.minimumDistributionThreshold <= 0) {
            this.errors.push('Invalid minimum distribution threshold');
        }
    }

    async verifyRaydium(raydium) {
        if (!raydium) {
            this.errors.push('Missing Raydium configuration');
            return;
        }

        const requiredFields = ['poolId', 'marketId', 'marketProgramId'];
        for (const field of requiredFields) {
            if (!raydium[field]) {
                this.errors.push(`Missing Raydium ${field}`);
                continue;
            }

            try {
                new PublicKey(raydium[field]);
            } catch (error) {
                this.errors.push(`Invalid Raydium ${field}`);
            }
        }

        if (!raydium.minimumLiquidity || raydium.minimumLiquidity <= 0) {
            this.warnings.push('No minimum liquidity threshold set');
        }

        if (!raydium.slippage || raydium.slippage <= 0 || raydium.slippage >= 100) {
            this.errors.push('Invalid slippage configuration');
        }
    }

    async verifyRewards(rewards) {
        if (!rewards) {
            this.errors.push('Missing rewards configuration');
            return;
        }

        if (!rewards.minimumTokenHoldingRequirement || rewards.minimumTokenHoldingRequirement <= 0) {
            this.errors.push('Invalid minimum token holding requirement');
        }
    }
}

// Run verification if called directly
if (require.main === module) {
    const configPath = process.argv[2] || path.join(__dirname, '../config.mainnet.json');
    const verifier = new ConfigVerifier(configPath);
    
    verifier.verify()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            log.error('Configuration verification failed with error', error);
            process.exit(1);
        });
} 
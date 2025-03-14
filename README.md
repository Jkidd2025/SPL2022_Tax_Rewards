# Solana Token Tax and Rewards System

A comprehensive Solana-based token management system that implements automatic tax collection and WBTC reward distribution for token holders.

## Features

### Tax Collection

- Automatic 5% tax on all token transfers
- Dedicated tax collector account
- Tax balance monitoring and withdrawal capabilities

### WBTC Rewards Distribution

- Automatic conversion of collected taxes to WBTC
- 50% of collected taxes distributed as WBTC rewards
- Minimum holding requirement of 50,000 tokens to qualify for rewards
- Proportional distribution based on token holdings
- Minimum WBTC distribution threshold to prevent dust transactions

## Prerequisites

- Node.js v14+ and npm
- Solana Tool Suite
- A Solana wallet with SOL for transaction fees

## Configuration

Create a `config.json` file in the root directory:

```json
{
  "network": {
    "endpoint": "https://api.devnet.solana.com",
    "alternateEndpoints": [
      "https://devnet.solana.rpcpool.com",
      "https://rpc-devnet.helius.xyz/?api-key=YOUR_API_KEY"
    ]
  },
  "wallets": {
    "tokenAuthority": {
      "publicKey": "YOUR_TOKEN_AUTHORITY_PUBLIC_KEY"
    },
    "mintAuthority": {
      "publicKey": "YOUR_MINT_AUTHORITY_PUBLIC_KEY"
    },
    "treasury": {
      "publicKey": "YOUR_TREASURY_PUBLIC_KEY"
    },
    "taxCollector": {
      "publicKey": "YOUR_TAX_COLLECTOR_PUBLIC_KEY"
    },
    "rewardsAccount": {
      "publicKey": "YOUR_REWARDS_ACCOUNT_PUBLIC_KEY"
    }
  },
  "tokenMint": "YOUR_TOKEN_MINT_ADDRESS",
  "wbtc": {
    "mint": "YOUR_WBTC_MINT_ADDRESS",
    "decimals": 8,
    "minimumDistributionThreshold": 0.00001
  },
  "rewards": {
    "minimumTokenHoldingRequirement": 50000
  },
  "swapConfig": {
    "poolAddress": "YOUR_SWAP_POOL_ADDRESS",
    "minimumAmountOut": 0
  }
}
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/solana-tax-rewards.git
cd solana-tax-rewards
```

2. Install dependencies:

```bash
npm install
```

3. Set up your wallet:

- Create a `wallets` directory in the project root
- Place your keypair JSON files in the `wallets` directory
- Update `config.json` with your public keys

## Usage

### Setting up the Tax Collector

```bash
node setup_tax_collector.js
```

### Distributing WBTC Rewards

```bash
node distribute_wbtc_rewards.js
```

This script will:

1. Check the current tax collection balance
2. Calculate 50% for rewards
3. Convert tokens to WBTC
4. Distribute WBTC to qualified holders (50,000+ tokens)

## Project Structure

```
├── config.json                 # Configuration file
├── src/
│   ├── managers/
│   │   ├── TokenManager.js    # Token management functionality
│   │   └── RewardsManager.js  # WBTC rewards distribution
├── scripts/
│   ├── setup_tax_collector.js # Tax collector setup
│   └── distribute_rewards.js  # Rewards distribution
└── wallets/                   # Wallet keypairs (not included in repo)
```

## Security Considerations

- Keep your wallet keypairs secure and never commit them to the repository
- Use environment variables for sensitive information
- Regularly monitor tax collection and distribution transactions
- Implement proper error handling and transaction confirmation checks

## Development

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Mainnet Deployment Guide

### Prerequisites

1. **Mainnet Requirements**

   - Minimum 5 SOL for deployment and operations
   - WBTC pool liquidity confirmed on mainnet
   - Production RPC endpoint (recommend using paid endpoints for reliability)

2. **Security Requirements**

   - Hardware wallet (e.g., Ledger) for critical accounts
   - Secure, isolated deployment environment
   - Backup solutions for all keypairs
   - Network security measures (VPN, firewall)

3. **Account Requirements**
   - Token Authority Account (hardware wallet recommended)
   - Tax Collector Account (dedicated account)
   - Rewards Account (dedicated account)
   - Treasury Account (hardware wallet recommended)

### Pre-Deployment Checklist

1. **Configuration Setup**

   ```bash
   # Create mainnet configuration
   cp config.json config.mainnet.json
   ```

2. **Update config.mainnet.json**
   ```json
   {
     "network": {
       "endpoint": "YOUR_MAINNET_RPC_ENDPOINT",
       "alternateEndpoints": ["BACKUP_RPC_ENDPOINT_1", "BACKUP_RPC_ENDPOINT_2"]
     },
     "wallets": {
       "tokenAuthority": {
         "publicKey": "MAINNET_TOKEN_AUTHORITY_PUBLIC_KEY"
       },
       "taxCollector": {
         "publicKey": "MAINNET_TAX_COLLECTOR_PUBLIC_KEY"
       },
       "rewardsAccount": {
         "publicKey": "MAINNET_REWARDS_ACCOUNT_PUBLIC_KEY"
       }
     },
     "wbtc": {
       "mint": "MAINNET_WBTC_MINT_ADDRESS",
       "decimals": 8,
       "minimumDistributionThreshold": 0.00001
     },
     "rewards": {
       "minimumTokenHoldingRequirement": 50000
     },
     "swapConfig": {
       "poolAddress": "MAINNET_WBTC_POOL_ADDRESS",
       "minimumAmountOut": 0
     }
   }
   ```

### Deployment Steps

1. **Environment Setup**

   ```bash
   # Switch to mainnet
   solana config set --url mainnet-beta

   # Verify connection
   solana cluster-version
   ```

2. **Account Setup**

   ```bash
   # Create secure directory for mainnet wallets
   mkdir -p wallets/mainnet
   chmod 700 wallets/mainnet

   # Generate accounts (if not using hardware wallet)
   solana-keygen new --outfile wallets/mainnet/tax-collector.json
   solana-keygen new --outfile wallets/mainnet/rewards.json
   ```

3. **Tax Collector Setup**

   ```bash
   # Fund tax collector account
   solana transfer <TAX_COLLECTOR_ADDRESS> 2 --allow-unfunded-recipient

   # Initialize tax collector
   NODE_ENV=production node setup_tax_collector.js --config config.mainnet.json
   ```

4. **Initial Testing**

   ```bash
   # Verify tax collection
   node check_balances.js --config config.mainnet.json

   # Test small transfer
   node distribute_wbtc_rewards.js --config config.mainnet.json --test-mode
   ```

### Post-Deployment Verification

1. **System Checks**

   - [ ] Tax collector account initialized and funded
   - [ ] WBTC pool connection verified
   - [ ] Test transfer completed successfully
   - [ ] All account balances correct
   - [ ] Rewards distribution tested with small amount

2. **Security Verification**

   - [ ] All private keys secured
   - [ ] Hardware wallets configured correctly
   - [ ] Backup procedures tested
   - [ ] Access controls implemented

3. **Monitoring Setup**
   - [ ] Transaction monitoring configured
   - [ ] Balance alerts set up
   - [ ] Error reporting system active
   - [ ] Backup RPC endpoints verified

### Regular Maintenance

1. **Daily Operations**

   ```bash
   # Check system health
   node check_balances.js --config config.mainnet.json

   # Review tax collection
   node view_tax_stats.js --config config.mainnet.json
   ```

2. **Weekly Tasks**

   - Review transaction logs
   - Verify WBTC pool liquidity
   - Check for any system updates
   - Backup configuration files

3. **Monthly Tasks**
   - Comprehensive system audit
   - Review and adjust thresholds if needed
   - Update RPC endpoints if necessary
   - Verify backup procedures

### Emergency Procedures

1. **System Issues**

   - Use backup RPC endpoints
   - Pause distributions if necessary
   - Contact technical support
   - Follow incident response plan

2. **Security Issues**

   ```bash
   # Pause all operations
   node pause_operations.js --config config.mainnet.json

   # Transfer to backup accounts if needed
   node emergency_transfer.js --config config.mainnet.json
   ```

### Important Notes

1. **Transaction Fees**

   - Maintain minimum 2 SOL for operations
   - Monitor fee changes
   - Adjust gas settings as needed

2. **Security Best Practices**

   - Never share private keys
   - Use hardware wallets for large holdings
   - Regular security audits
   - Keep software updated

3. **Compliance**
   - Document all transactions
   - Maintain operation logs
   - Follow regulatory requirements
   - Keep configuration backups

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk.

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

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk.

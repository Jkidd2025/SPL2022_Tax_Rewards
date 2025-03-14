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

### Phase 1: Development Completion

1. **Code Updates**

   ```bash
   # Install additional dependencies
   npm install winston @sentry/node decimal.js
   ```

   - [ ] Implement transaction retry logic
   - [ ] Add transaction size limits
   - [ ] Implement comprehensive logging
   - [ ] Add emergency pause functionality
   - [ ] Create transaction simulation checks

2. **Configuration Verification**

   ```bash
   # Verify configuration structure
   node scripts/verify_config.js

   # Test configuration loading
   node scripts/test_config_load.js
   ```

   - [ ] Verify all mainnet addresses
   - [ ] Confirm Raydium pool settings
   - [ ] Validate token decimals
   - [ ] Check minimum thresholds

### Phase 2: Testing and Verification

1. **Local Testing**

   ```bash
   # Run test suite
   npm run test

   # Run specific test categories
   npm run test:swap
   npm run test:rewards
   npm run test:security
   ```

   - [ ] Unit tests for all components
   - [ ] Integration tests for swap functionality
   - [ ] Security test cases
   - [ ] Error handling verification

2. **Devnet Deployment**

   ```bash
   # Deploy to devnet
   npm run deploy:devnet

   # Run integration tests
   npm run test:integration:devnet
   ```

   - [ ] Full system test on devnet
   - [ ] Performance testing
   - [ ] Load testing
   - [ ] Error recovery testing

### Phase 3: Security Setup

1. **Wallet Security**

   ```bash
   # Generate new mainnet wallets
   solana-keygen new --outfile wallets/mainnet/rewards.json
   solana-keygen new --outfile wallets/mainnet/tax-collector.json
   ```

   - [ ] Hardware wallet setup
   - [ ] Multi-sig configuration
   - [ ] Backup procedures
   - [ ] Access control implementation

2. **Monitoring Setup**

   ```bash
   # Configure monitoring
   node scripts/setup_monitoring.js

   # Test alert system
   node scripts/test_alerts.js
   ```

   - [ ] Transaction monitoring
   - [ ] Error alerting
   - [ ] Balance monitoring
   - [ ] Performance metrics

### Phase 4: Mainnet Preparation

1. **Network Configuration**

   ```bash
   # Set up mainnet connection
   solana config set --url mainnet-beta

   # Verify connection
   solana cluster-version
   ```

   - [ ] RPC endpoint configuration
   - [ ] Backup RPC setup
   - [ ] Network stability verification
   - [ ] Rate limit configuration

2. **Account Funding**

   ```bash
   # Fund operational accounts
   solana transfer <TAX_COLLECTOR_ADDRESS> 5 --allow-unfunded-recipient
   solana transfer <REWARDS_ADDRESS> 5 --allow-unfunded-recipient
   ```

   - [ ] Minimum SOL requirements
   - [ ] Operating budget calculation
   - [ ] Emergency fund allocation
   - [ ] Fee buffer setup

### Phase 5: Deployment Process

1. **Pre-deployment Verification**

   ```bash
   # Run pre-deployment checks
   node scripts/pre_deployment_check.js

   # Verify pool liquidity
   node scripts/check_pool_liquidity.js
   ```

   - [ ] Configuration validation
   - [ ] Account permission verification
   - [ ] Pool liquidity confirmation
   - [ ] System readiness check

2. **Deployment Steps**

   ```bash
   # Deploy system components
   npm run deploy:mainnet

   # Verify deployment
   npm run verify:mainnet
   ```

   - [ ] Sequential component deployment
   - [ ] Verification after each step
   - [ ] Initial test transactions
   - [ ] System pause capability verification

### Phase 6: Post-Deployment

1. **System Verification**

   ```bash
   # Run system checks
   node scripts/verify_deployment.js

   # Test core functionality
   node scripts/test_core_functions.js
   ```

   - [ ] All components operational
   - [ ] Monitoring systems active
   - [ ] Alert systems functioning
   - [ ] Backup systems ready

2. **Documentation Update**
   - [ ] Deployment records
   - [ ] Configuration documentation
   - [ ] Emergency procedures
   - [ ] Contact information

### Emergency Procedures

1. **System Issues**

   ```bash
   # Pause system
   node scripts/emergency_pause.js

   # Execute emergency withdrawal
   node scripts/emergency_withdraw.js
   ```

2. **Recovery Process**

   ```bash
   # System recovery
   node scripts/system_recovery.js

   # Verify system state
   node scripts/verify_system_state.js
   ```

### Maintenance Procedures

1. **Regular Checks**

   ```bash
   # Daily health check
   npm run health-check

   # Weekly maintenance
   npm run maintenance
   ```

2. **Update Procedures**

   ```bash
   # System updates
   npm run update

   # Configuration updates
   npm run update-config
   ```

## Security Considerations

1. **Transaction Security**

   - Maximum transaction size limits
   - Retry logic for failed transactions
   - Transaction simulation before execution
   - Rate limiting implementation

2. **Account Security**

   - Hardware wallet integration
   - Multi-signature requirements
   - Account activity monitoring
   - Automatic alerts for suspicious activity

3. **Network Security**
   - RPC endpoint redundancy
   - Connection monitoring
   - Rate limit management
   - Error handling and recovery

## Monitoring and Maintenance

1. **System Monitoring**

   - Transaction success rates
   - Account balances
   - Pool liquidity levels
   - Network performance

2. **Alert System**
   - Failed transaction alerts
   - Balance threshold alerts
   - Error condition notifications
   - System pause notifications

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk.

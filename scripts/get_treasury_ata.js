const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { PublicKey } = require('@solana/web3.js');

async function getTreasuryATA() {
    const BPAY_MINT = new PublicKey('DVSSBXY2Kvpt7nmPRfbY9JNdgMnm8y6TvkkwoZiVQUiv');
    const TREASURY = new PublicKey('DPnKM32e59P1ErpveErNxZcgZ1yS71uRdz6488k4sUMh');

    const treasuryATA = await getAssociatedTokenAddress(BPAY_MINT, TREASURY);
    console.log('Treasury ATA:', treasuryATA.toString());
}

getTreasuryATA(); 
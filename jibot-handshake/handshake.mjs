import { webcrypto } from 'crypto';
globalThis.crypto = webcrypto;

import { wrapAxiosWithPayment, x402Client } from '@x402/axios';
import { ExactEvmScheme } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';
import axios from 'axios';

const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const WALLET = process.env.WALLET_ADDRESS;

if (!PRIVATE_KEY || !WALLET) {
  console.error('環境変数を設定してください:');
  console.error('  export WALLET_PRIVATE_KEY="0x..."');
  console.error('  export WALLET_ADDRESS="0x..."');
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

// Optimism (eip155:10) を優先するクライアント
const client = new x402Client((_, accepts) =>
  accepts.find(a => a.network === 'eip155:10') ?? accepts[0]
);
client.register('eip155:*', new ExactEvmScheme(account));

const api = wrapAxiosWithPayment(axios.create(), client);

console.log('ウォレット:', WALLET);
console.log('Jibot にハンドシェイクを送信中...');
console.log('(x402 プロトコルで $0.01 USDC を自動支払いします)');
console.log('');

try {
  const response = await api.post('https://jibot.md/api/handshake', {
    wallet: WALLET,
    audience: 'gairon'
  });

  console.log('成功!');
  console.log('Response:', JSON.stringify(response.data, null, 2));
  console.log('');
  console.log('ステータス確認: node status.mjs');
} catch (err) {
  if (err.response) {
    console.error('エラー:', err.response.status, err.response.data);
  } else {
    console.error('エラー:', err.message);
  }
  process.exit(1);
}

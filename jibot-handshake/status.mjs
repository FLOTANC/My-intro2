import axios from 'axios';

const WALLET = process.env.WALLET_ADDRESS;

if (!WALLET) {
  console.error('export WALLET_ADDRESS="0x..." を設定してください');
  process.exit(1);
}

const response = await axios.get(
  `https://jibot.md/api/handshake/status?wallet=${WALLET}&audience=gairon`
);

console.log('ステータス:', JSON.stringify(response.data, null, 2));

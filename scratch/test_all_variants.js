const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const token = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_NUMBER_ID;

const numbers = [
  "5491166784762",
  "541166784762",
  "5491159961188",
  "541159961188",
  "+5491166784762",
  "+541166784762",
  "+5491159961188",
  "+541159961188"
];

async function send(to) {
  try {
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { preview_url: false, body: `Prueba de envío a ${to}` }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Éxito para ${to}:`, response.data);
    return true;
  } catch (error) {
    console.error(`❌ Error para ${to}:`, error.response?.data?.error?.message || error.message);
    return false;
  }
}

(async () => {
  for (const num of numbers) {
    await send(num);
  }
})();

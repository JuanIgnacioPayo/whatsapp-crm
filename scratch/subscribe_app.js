const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const token = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_NUMBER_ID;
const wabaId = "2574749406289759";

if (!token || !phoneId) {
  console.error('Faltan credenciales en el .env');
  process.exit(1);
}

(async () => {
  try {
    console.log('WABA ID:', wabaId);

    console.log('Suscribiendo la App al WABA...');
    const subRes = await axios.post(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Resultado de la suscripción:', subRes.data);
    
    console.log('Verificando aplicaciones suscritas...');
    const verifyRes = await axios.get(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Aplicaciones actualmente suscritas:', verifyRes.data);
  } catch (err) {
    console.error('Error durante el proceso:', err.response?.data || err.message);
  }
})();

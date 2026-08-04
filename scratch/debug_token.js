const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const token = process.env.META_ACCESS_TOKEN;
const phoneId = process.env.META_PHONE_NUMBER_ID;
const wabaId = "2574749406289759";

(async () => {
  try {
    console.log('--- Probando Token de Acceso ---');
    
    // 1. Obtener información de la app/usuario dueño del token
    try {
      const debugRes = await axios.get(`https://graph.facebook.com/debug_token?input_token=${token}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Debug Token:', debugRes.data);
    } catch (e) {
      console.log('Error debug_token:', e.response?.data || e.message);
    }

    // 2. Obtener información de la app actual
    try {
      const meRes = await axios.get(`https://graph.facebook.com/v20.0/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Info del Token (me):', meRes.data);
    } catch (e) {
      console.log('Error /me:', e.response?.data || e.message);
    }

    // 3. Obtener números de teléfono del WABA
    try {
      const numbersRes = await axios.get(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Números del WABA:', numbersRes.data);
    } catch (e) {
      console.log('Error /phone_numbers:', e.response?.data || e.message);
    }

  } catch (err) {
    console.error('Error general:', err.message);
  }
})();

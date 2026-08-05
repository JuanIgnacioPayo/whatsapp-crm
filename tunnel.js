const localtunnel = require('localtunnel');
const fs = require('fs');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    const webhookUrl = `${tunnel.url}/webhook`;
    console.log(`====================================`);
    console.log(`🌍 PUBLIC TUNNEL URL: ${tunnel.url}`);
    console.log(`📡 WEBHOOK FULL URL: ${webhookUrl}`);
    console.log(`====================================`);

    fs.writeFileSync(__dirname + '/tunnel_url.txt', webhookUrl);

    // Sincronizar con Firestore si existe el archivo de credenciales
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const admin = require('firebase-admin');
        const serviceAccount = require(serviceAccountPath);
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        }
        const db = admin.firestore();
        await db.collection('config').doc('backend').set({
          url: webhookUrl,
          baseUrl: tunnel.url,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`🔥 [FIREBASE] URL del túnel sincronizada en Firestore!`);
      } catch (err) {
        console.error('Error al sincronizar con Firestore:', err);
      }
    }
  } catch (err) {
    console.error('Error al iniciar túnel:', err);
  }
})();

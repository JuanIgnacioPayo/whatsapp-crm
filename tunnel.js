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
  } catch (err) {
    console.error('Error al iniciar túnel:', err);
  }
})();

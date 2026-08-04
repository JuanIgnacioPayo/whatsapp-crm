const { startTunnel } = require('untun');
const fs = require('fs');

(async () => {
  try {
    const tunnel = await startTunnel({ port: 3000 });
    const url = await tunnel.getURL();
    const webhookUrl = `${url}/webhook`;

    console.log(`====================================`);
    console.log(`⚡ CLOUDFLARE TUNNEL URL: ${url}`);
    console.log(`📡 WEBHOOK URL: ${webhookUrl}`);
    console.log(`====================================`);

    fs.writeFileSync(__dirname + '/cloudflare_url.txt', webhookUrl);
  } catch (err) {
    console.error('Error iniciando túnel Cloudflare:', err);
  }
})();

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { handleIncomingMessage } from './bot.service';
import { getIO } from './socket.service';

let sock: WASocket | null = null;
let currentQrDataUrl: string | null = null;
let isConnected = false;
let connectedUser: any = null;

const AUTH_DIR = path.join(__dirname, '../../baileys_auth_info');

export async function initBaileysEngine() {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`⚡ Iniciando motor WhatsApp (Baileys v${version.join('.')})...`);

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }) as any,
      browser: ['CRM WhatsApp', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📸 Código QR generado por Baileys! Convirtiendo a Imagen...');
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr);
          isConnected = false;
          connectedUser = null;
          
          try {
            const io = getIO();
            io.emit('qr_code', { qr: currentQrDataUrl, connected: false });
          } catch (e) {}
        } catch (e) {
          console.error('Error convirtiendo QR a DataURL:', e);
        }
      }

      if (connection === 'open') {
        console.log('✅ ¡WhatsApp vinculado y conectado por Código QR exitosamente!');
        isConnected = true;
        currentQrDataUrl = null;
        connectedUser = sock?.user || null;

        try {
          const io = getIO();
          io.emit('whatsapp_status', {
            connected: true,
            user: connectedUser,
            phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null
          });
        } catch (e) {}
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`⚠️ Conexión de WhatsApp cerrada. ¿Reconectar?: ${shouldReconnect}`);
        
        isConnected = false;
        connectedUser = null;
        try {
          const io = getIO();
          io.emit('whatsapp_status', { connected: false });
        } catch (e) {}

        if (shouldReconnect) {
          setTimeout(() => initBaileysEngine(), 3000);
        } else {
          console.warn('🔒 Sesión cerrada por el usuario. Limpiando credenciales...');
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          setTimeout(() => initBaileysEngine(), 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        // Ignorar mensajes propios enviados desde el celular o mensajes sin contenido
        if (msg.key.fromMe) continue;

        const fromJid = msg.key.remoteJid;
        if (!fromJid || fromJid.endsWith('@g.us')) continue; // Ignorar grupos por ahora

        const fromPhone = fromJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const profileName = msg.pushName || undefined;

        let incomingText = '';
        if (msg.message?.conversation) {
          incomingText = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
          incomingText = msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage?.caption) {
          incomingText = msg.message.imageMessage.caption || '📷 Imagen recibida';
        } else {
          incomingText = 'Mensaje de WhatsApp';
        }

        console.log(`📩 [BAILEYS QR] Mensaje entrante de ${fromPhone} (${profileName || 'Anónimo'}): "${incomingText}"`);

        try {
          await handleIncomingMessage(fromPhone, incomingText, profileName);
        } catch (err) {
          console.error('Error procesando mensaje entrante en Baileys:', err);
        }
      }
    });

  } catch (err) {
    console.error('Error al inicializar motor Baileys:', err);
  }
}

export async function sendWhatsAppMessageViaQR(toPhone: string, textContent: string): Promise<{ success: boolean; messageId?: string }> {
  if (!sock || !isConnected) {
    console.warn(`⚠️ No se puede enviar mensaje a ${toPhone}: Sesión de WhatsApp desvinculada.`);
    return { success: false };
  }

  try {
    let cleanPhone = toPhone.replace(/\D/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const sentMsg = await sock.sendMessage(jid, { text: textContent });
    console.log(`📤 [BAILEYS QR] Mensaje enviado exitosamente a ${cleanPhone}: "${textContent}"`);

    return { success: true, messageId: sentMsg?.key?.id || `baileys_${Date.now()}` };
  } catch (error: any) {
    console.error('❌ Error al enviar mensaje vía Baileys QR:', error?.message || error);
    return { success: false };
  }
}

export function getWhatsAppStatus() {
  return {
    connected: isConnected,
    qr: currentQrDataUrl,
    user: connectedUser,
    phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null
  };
}

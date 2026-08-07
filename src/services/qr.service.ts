import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  Browsers,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { PrismaClient } from '@prisma/client';
import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { handleIncomingMessage } from './bot.service';
import { getIO } from './socket.service';

let sock: WASocket | null = null;
let currentQrDataUrl: string | null = null;
let isConnected = false;
let connectedUser: any = null;

let systemSettingsCache: Record<string, string> = {
  ignore_groups: 'true',
  ignore_status: 'true'
};

export async function loadSystemSettings() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
      if (prisma.systemSetting && typeof prisma.systemSetting.findMany === 'function') {
        const settings = await prisma.systemSetting.findMany();
        for (const setting of settings) {
          systemSettingsCache[setting.key] = setting.value;
        }
      } else {
        console.log('⚠️ Modelo SystemSetting no disponible, usando valores por defecto.');
      }
    } catch (error) {
      console.error('Error loading system settings:', error);
    } finally {
      await prisma.$disconnect();
    }
  } catch (e) {
    console.error('⚠️ PrismaClient no disponible para cargar settings, usando valores por defecto.');
  }
}

const AUTH_DIR = path.join(__dirname, '../../baileys_auth_info');

export async function backupAuthToDb(prisma: PrismaClient) {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const zip = new AdmZip();
    zip.addLocalFolder(AUTH_DIR);
    const zipBuffer = zip.toBuffer();
    const dataString = zipBuffer.toString('base64');
    
    await prisma.baileysSession.upsert({
      where: { sessionId_id: { sessionId: 'default', id: 'ZIP' } },
      create: { sessionId: 'default', id: 'ZIP', data: dataString },
      update: { data: dataString }
    });
    console.log('✅ Auth Backup guardado en DB');
  } catch (e) {
    console.error('Error guardando backup de Auth:', e);
  }
}

export async function restoreAuthFromDb(prisma: PrismaClient) {
  try {
    const record = await prisma.baileysSession.findUnique({
      where: { sessionId_id: { sessionId: 'default', id: 'ZIP' } }
    });
    
    if (record && record.data) {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
      const zipBuffer = Buffer.from(record.data, 'base64');
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(AUTH_DIR, true);
      console.log('✅ Auth restaurado desde DB');
    }
  } catch (e) {
    console.error('Error restaurando Auth desde DB:', e);
  }
}

export async function initBaileysEngine() {
  await loadSystemSettings();
  try {
    const prisma = new PrismaClient();
    await restoreAuthFromDb(prisma);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`⚡ Iniciando motor WhatsApp (Baileys v${version.join('.')})...`);

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }) as any),
      },
      printQRInTerminal: true,
      logger: pino({ level: 'debug' }, pino.destination(path.join(__dirname, '../../baileys.log'))) as any,
      browser: Browsers.macOS('Desktop'),
      generateHighQualityLinkPreview: true,
      qrTimeout: 120000,
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 120000,
      keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    // Backup to DB every 2 minutes instead of every creds update to prevent CPU/DB overload
    setInterval(() => {
      backupAuthToDb(prisma);
    }, 120000);

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
            io.emit('qr_code', { qr: currentQrDataUrl, connected: false, ttl: 60 });
          } catch (e) {}
        } catch (e) {
          console.error('Error convirtiendo QR a DataURL:', e);
        }
      }

      if (connection === 'open') {
        console.log('✅ ¡WhatsApp vinculado y conectado por Código QR exitosamente!');
        isConnected = true;
        
        // Backup immediately on successful connection
        backupAuthToDb(prisma);
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
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(`⚠️ Conexión de WhatsApp cerrada. Status: ${(lastDisconnect?.error as Boom)?.output?.statusCode}, Razón: ${(lastDisconnect?.error as Error)?.message}, ¿Reconectar?:`, shouldReconnect);
        
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
          try {
            const prisma = new (require('@prisma/client').PrismaClient)();
            await prisma.baileysSession.deleteMany({
              where: { sessionId: 'default' }
            });
            await prisma.$disconnect();
          } catch (e) {
            console.error('Error al borrar sesión de DB:', e);
          }
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          setTimeout(() => initBaileysEngine(), 3000);
        }
      }
    });

    // Escuchar la sincronización inicial del historial reciente de WhatsApp Web
    sock.ev.on('messaging-history.set', async ({ chats, messages, contacts }) => {
      console.log(`📚 [BAILEYS QR] Sincronizando historial reciente: ${chats?.length || 0} chats, ${messages?.length || 0} mensajes, ${contacts?.length || 0} contactos...`);
      
      if (contacts && contacts.length > 0) {
        const prisma = new (require('@prisma/client').PrismaClient)();
        for (const contact of contacts) {
          if (!contact.name) continue;
          const phone = contact.id.replace('@s.whatsapp.net', '').replace('@c.us', '').split(':')[0];
          try {
            await prisma.customer.updateMany({
              where: { externalId: phone },
              data: { name: contact.name }
            });
          } catch (e) {}
        }
      }

      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        try {
          const fromJid = msg.key.remoteJid;
          
          const ignoreGroups = systemSettingsCache['ignore_groups'] !== 'false';
          const ignoreStatus = systemSettingsCache['ignore_status'] !== 'false';
          if (!fromJid) continue;
          if (ignoreGroups && fromJid.endsWith('@g.us')) continue;
          if (ignoreStatus && fromJid === 'status@broadcast') continue;

          const fromPhone = fromJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
          const isFromMe = msg.key.fromMe;
          const profileName = msg.pushName || undefined;

          let text = '';
          if (msg.message?.conversation) {
            text = msg.message.conversation;
          } else if (msg.message?.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
          } else if (msg.message?.imageMessage?.caption) {
            text = msg.message.imageMessage.caption || '📷 Imagen recibida';
          } else {
            continue;
          }

          const prisma = new (require('@prisma/client').PrismaClient)();
          let customer = await prisma.customer.findUnique({ where: { externalId: fromPhone } });
          if (!customer) {
            customer = await prisma.customer.create({
              data: {
                externalId: fromPhone,
                channel: 'WHATSAPP',
                name: profileName || `Cliente ${fromPhone.slice(-4)}`,
                conversationState: 'PENDING'
              }
            });
          }

          const msgDate = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();

          await prisma.message.create({
            data: {
              customerId: customer.id,
              senderType: isFromMe ? 'OPERATOR' : 'CUSTOMER',
              operatorName: isFromMe ? 'WhatsApp Celular' : undefined,
              text,
              createdAt: msgDate,
              status: 'READ'
            }
          }).catch(() => {});
          await prisma.$disconnect();
        } catch (e) {
          // Ignorar errores individuales en el bucle de sincronización
        }
      }
      console.log(`✅ Sincronización del historial reciente completada.`);
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
      console.log(`📚 [BAILEYS QR] Actualizando ${contacts.length} contactos de la agenda...`);
      if (contacts && contacts.length > 0) {
        const prisma = new (require('@prisma/client').PrismaClient)();
        for (const contact of contacts) {
          if (!contact.name) continue;
          const phone = contact.id.replace('@s.whatsapp.net', '').replace('@c.us', '').split(':')[0];
          try {
            await prisma.customer.updateMany({
              where: { externalId: phone },
              data: { name: contact.name }
            });
          } catch (e) {}
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        // Ignorar mensajes propios enviados desde el celular o mensajes sin contenido
        if (msg.key.fromMe) continue;

        const fromJid = msg.key.remoteJid;
        
        const ignoreGroups = systemSettingsCache['ignore_groups'] !== 'false';
        const ignoreStatus = systemSettingsCache['ignore_status'] !== 'false';
        if (!fromJid) continue;
        if (ignoreGroups && fromJid.endsWith('@g.us')) continue;
        if (ignoreStatus && (fromJid === 'status@broadcast' || fromJid.endsWith('@newsletter') || fromJid.endsWith('@broadcast'))) continue;

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
          const prisma = new (require('@prisma/client').PrismaClient)();
          let customer = await prisma.customer.findUnique({ where: { externalId: fromPhone } });
          // Obtener foto y estado si el cliente existe y no los tiene (lazy fetch para no bloquear)
          if (customer && (!customer.profilePictureUrl || !customer.about)) {
            try {
              if (!sock) return;
              const ppUrl = await sock.profilePictureUrl(fromJid, 'preview').catch((err) => {
                console.error(`Error fetching profile pic for ${fromJid}:`, err?.message);
                return null;
              });
              const statusData = await sock.fetchStatus(fromJid).catch(() => null) as any;
              
              if (ppUrl || statusData?.status) {
                await prisma.customer.update({
                  where: { externalId: fromPhone },
                  data: {
                    profilePictureUrl: ppUrl || customer.profilePictureUrl,
                    about: statusData?.status || customer.about
                  }
                });
              }
            } catch (e) {
              console.error('Error fetching WA profile info:', e);
            }
          }
        } catch (e) {
          console.error('Error in DB check for profile info:', e);
        }

        try {
          await handleIncomingMessage(fromPhone, incomingText, 'WHATSAPP', profileName, msg.key?.id || undefined);
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
    phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null,
    ttl: 60
  };
}

export async function disconnectWhatsApp() {
  if (sock) {
    console.log('🔒 Cerrando sesión de WhatsApp por solicitud...');
    try {
      await sock.logout();
    } catch (e) {
      console.error('Error al cerrar sesión de WhatsApp:', e);
    }
  }
  
  if (fs.existsSync(AUTH_DIR)) {
    console.log('🗑️ Limpiando credenciales (baileys_auth_info)...');
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  
  isConnected = false;
  connectedUser = null;
  currentQrDataUrl = null;
  sock = null;
  
  try {
    const io = getIO();
    io.emit('whatsapp_status', { connected: false });
  } catch (e) {}

  console.log('🔄 Reiniciando motor Baileys en 3 segundos...');
  setTimeout(() => initBaileysEngine(), 3000);
  return { success: true };
}

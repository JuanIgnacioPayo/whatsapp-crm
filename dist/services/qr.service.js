"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBaileysEngine = initBaileysEngine;
exports.sendWhatsAppMessageViaQR = sendWhatsAppMessageViaQR;
exports.getWhatsAppStatus = getWhatsAppStatus;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const qrcode_1 = __importDefault(require("qrcode"));
const pino_1 = __importDefault(require("pino"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bot_service_1 = require("./bot.service");
const socket_service_1 = require("./socket.service");
let sock = null;
let currentQrDataUrl = null;
let isConnected = false;
let connectedUser = null;
const AUTH_DIR = path_1.default.join(__dirname, '../../baileys_auth_info');
async function initBaileysEngine() {
    try {
        if (!fs_1.default.existsSync(AUTH_DIR)) {
            fs_1.default.mkdirSync(AUTH_DIR, { recursive: true });
        }
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(AUTH_DIR);
        const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
        console.log(`⚡ Iniciando motor WhatsApp (Baileys v${version.join('.')})...`);
        sock = (0, baileys_1.default)({
            version,
            auth: state,
            printQRInTerminal: true,
            logger: (0, pino_1.default)({ level: 'silent' }),
            browser: ['CRM WhatsApp', 'Chrome', '1.0.0']
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log('📸 Código QR generado por Baileys! Convirtiendo a Imagen...');
                try {
                    currentQrDataUrl = await qrcode_1.default.toDataURL(qr);
                    isConnected = false;
                    connectedUser = null;
                    try {
                        const io = (0, socket_service_1.getIO)();
                        io.emit('qr_code', { qr: currentQrDataUrl, connected: false });
                    }
                    catch (e) { }
                }
                catch (e) {
                    console.error('Error convirtiendo QR a DataURL:', e);
                }
            }
            if (connection === 'open') {
                console.log('✅ ¡WhatsApp vinculado y conectado por Código QR exitosamente!');
                isConnected = true;
                currentQrDataUrl = null;
                connectedUser = sock?.user || null;
                try {
                    const io = (0, socket_service_1.getIO)();
                    io.emit('whatsapp_status', {
                        connected: true,
                        user: connectedUser,
                        phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null
                    });
                }
                catch (e) { }
            }
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                console.log(`⚠️ Conexión de WhatsApp cerrada. ¿Reconectar?: ${shouldReconnect}`);
                isConnected = false;
                connectedUser = null;
                try {
                    const io = (0, socket_service_1.getIO)();
                    io.emit('whatsapp_status', { connected: false });
                }
                catch (e) { }
                if (shouldReconnect) {
                    setTimeout(() => initBaileysEngine(), 3000);
                }
                else {
                    console.warn('🔒 Sesión cerrada por el usuario. Limpiando credenciales...');
                    if (fs_1.default.existsSync(AUTH_DIR)) {
                        fs_1.default.rmSync(AUTH_DIR, { recursive: true, force: true });
                    }
                    setTimeout(() => initBaileysEngine(), 3000);
                }
            }
        });
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type !== 'notify')
                return;
            for (const msg of m.messages) {
                // Ignorar mensajes propios enviados desde el celular o mensajes sin contenido
                if (msg.key.fromMe)
                    continue;
                const fromJid = msg.key.remoteJid;
                if (!fromJid || fromJid.endsWith('@g.us'))
                    continue; // Ignorar grupos por ahora
                const fromPhone = fromJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const profileName = msg.pushName || undefined;
                let incomingText = '';
                if (msg.message?.conversation) {
                    incomingText = msg.message.conversation;
                }
                else if (msg.message?.extendedTextMessage?.text) {
                    incomingText = msg.message.extendedTextMessage.text;
                }
                else if (msg.message?.imageMessage?.caption) {
                    incomingText = msg.message.imageMessage.caption || '📷 Imagen recibida';
                }
                else {
                    incomingText = 'Mensaje de WhatsApp';
                }
                console.log(`📩 [BAILEYS QR] Mensaje entrante de ${fromPhone} (${profileName || 'Anónimo'}): "${incomingText}"`);
                try {
                    await (0, bot_service_1.handleIncomingMessage)(fromPhone, incomingText, profileName);
                }
                catch (err) {
                    console.error('Error procesando mensaje entrante en Baileys:', err);
                }
            }
        });
    }
    catch (err) {
        console.error('Error al inicializar motor Baileys:', err);
    }
}
async function sendWhatsAppMessageViaQR(toPhone, textContent) {
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
    }
    catch (error) {
        console.error('❌ Error al enviar mensaje vía Baileys QR:', error?.message || error);
        return { success: false };
    }
}
function getWhatsAppStatus() {
    return {
        connected: isConnected,
        qr: currentQrDataUrl,
        user: connectedUser,
        phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null
    };
}

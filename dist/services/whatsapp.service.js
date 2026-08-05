"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsAppMessage = sendWhatsAppMessage;
const qr_service_1 = require("./qr.service");
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
async function sendWhatsAppMessage(toPhone, textContent) {
    // 1. Intentar enviar vía Baileys QR si la sesión está conectada
    const status = (0, qr_service_1.getWhatsAppStatus)();
    if (status.connected) {
        return await (0, qr_service_1.sendWhatsAppMessageViaQR)(toPhone, textContent);
    }
    // 2. Si no hay QR conectado, fallback a Meta Cloud API si hay token
    let cleanPhone = toPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('549') && cleanPhone.length === 13) {
        cleanPhone = '54' + cleanPhone.substring(3);
    }
    if (!META_ACCESS_TOKEN || META_ACCESS_TOKEN.startsWith('EAAG...')) {
        console.log(`[SIMULACIÓN] 📤 Mensaje a ${cleanPhone}: "${textContent}"`);
        return { success: true, messageId: `sim_msg_${Date.now()}` };
    }
    try {
        const url = `https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`;
        const response = await axios_1.default.post(url, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'text',
            text: { preview_url: false, body: textContent }
        }, {
            headers: {
                Authorization: `Bearer ${META_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        const messageId = response.data?.messages?.[0]?.id;
        return { success: true, messageId };
    }
    catch (error) {
        console.error('[META API ERROR]', error?.response?.data || error.message);
        return { success: false };
    }
}

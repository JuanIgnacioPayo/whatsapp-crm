"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageToCustomer = sendMessageToCustomer;
const whatsapp_service_1 = require("./whatsapp.service");
const axios_1 = __importDefault(require("axios"));
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
async function sendMessageToCustomer(customer, text) {
    try {
        if (customer.channel === 'WHATSAPP') {
            return await (0, whatsapp_service_1.sendWhatsAppMessage)(customer.externalId, text);
        }
        if (customer.channel === 'MESSENGER' || customer.channel === 'INSTAGRAM') {
            if (!META_ACCESS_TOKEN) {
                console.error('No META_ACCESS_TOKEN configurado para enviar a Facebook/Instagram.');
                return { success: false };
            }
            const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${META_ACCESS_TOKEN}`;
            const payload = {
                recipient: { id: customer.externalId },
                message: { text }
            };
            const response = await axios_1.default.post(url, payload);
            return { success: true, messageId: response.data?.message_id };
        }
        console.warn(`Canal desconocido para envío: ${customer.channel}`);
        return { success: false };
    }
    catch (error) {
        console.error(`Error enviando mensaje por ${customer.channel}:`, error?.response?.data || error.message);
        return { success: false };
    }
}

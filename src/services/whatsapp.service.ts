import { sendWhatsAppMessageViaQR, getWhatsAppStatus } from './qr.service';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';

export async function sendWhatsAppMessage(toPhone: string, textContent: string): Promise<{ success: boolean; messageId?: string }> {
  // 1. Intentar enviar vía Baileys QR si la sesión está conectada
  const status = getWhatsAppStatus();
  if (status.connected) {
    return await sendWhatsAppMessageViaQR(toPhone, textContent);
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
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: textContent }
      },
      {
        headers: {
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const messageId = response.data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (error: any) {
    console.error('[META API ERROR]', error?.response?.data || error.message);
    return { success: false };
  }
}

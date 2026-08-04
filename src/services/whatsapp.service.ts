import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';

export async function sendWhatsAppMessage(toPhone: string, textContent: string): Promise<{ success: boolean; messageId?: string }> {
  // Si no hay token de Meta configurado en desarrollo, simulamos el envío exitoso
  if (!META_ACCESS_TOKEN || META_ACCESS_TOKEN.startsWith('EAAG...')) {
    console.log(`[SIMULACIÓN META API] 📤 Mensaje enviado a ${toPhone}: "${textContent}"`);
    return { success: true, messageId: `sim_msg_${Date.now()}` };
  }

  try {
    const url = `https://graph.facebook.com/v20.0/${META_PHONE_NUMBER_ID}/messages`;
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
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

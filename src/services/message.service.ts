import { sendWhatsAppMessage } from './whatsapp.service';
import axios from 'axios';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

export async function sendMessageToCustomer(customer: any, text: string): Promise<{ success: boolean; messageId?: string }> {
  try {
    if (customer.channel === 'WHATSAPP') {
      return await sendWhatsAppMessage(customer.externalId, text);
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

      const response = await axios.post(url, payload);
      return { success: true, messageId: response.data?.message_id };
    }

    console.warn(`Canal desconocido para envío: ${customer.channel}`);
    return { success: false };
  } catch (error: any) {
    console.error(`Error enviando mensaje por ${customer.channel}:`, error?.response?.data || error.message);
    return { success: false };
  }
}

import { Request, Response } from 'express';
import { handleIncomingMessage } from '../services/bot.service';

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'crm_whatsapp_secret_token_123';

/**
 * GET /webhook
 * Endpoint de verificación exigido por Meta para dar de alta el Webhook en el Dashboard de Facebook Developers.
 */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      console.log('✅ Webhook de Meta verificado correctamente.');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ Token de verificación inválido en Webhook.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
}

/**
 * POST /webhook
 * Recepción de eventos y mensajes entrantes de WhatsApp Cloud API.
 */
export async function receiveWebhookMessage(req: Request, res: Response) {
  try {
    const body = req.body;
    console.log('🔔 [WEBHOOK POST RECIBIDO EN SERVIDOR]', JSON.stringify(body, null, 2));

    // 1. WhatsApp Cloud API
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (value && value.messages && value.messages[0]) {
        const message = value.messages[0];
        const fromPhone = message.from; 
        const profileName = value.contacts?.[0]?.profile?.name || undefined;
        const msgId = message.id;

        let incomingText = 'Mensaje de WhatsApp';
        if (message.type === 'text' && message.text) {
          incomingText = message.text.body;
        } else if (message.interactive) {
          incomingText = message.interactive.button_reply?.title || message.interactive.list_reply?.title || 'Opción elegida';
        } else if (message.type === 'button') {
          incomingText = message.button?.text || 'Botón presionado';
        }

        console.log(`📩 [WhatsApp Cloud API] Mensaje de ${fromPhone}: ${incomingText}`);
        await handleIncomingMessage(fromPhone, incomingText, 'WHATSAPP', profileName, msgId);
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    // 2. Facebook Messenger / Instagram Direct
    if (body.object === 'page' || body.object === 'instagram') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const messagingEvents = entry.messaging || [];
        for (const event of messagingEvents) {
          if (event.message && !event.message.is_echo) {
            const senderId = event.sender.id;
            const text = event.message.text || 'Archivo/Media adjunto';
            const msgId = event.message.mid;
            
            const channel = body.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER';
            console.log(`📩 [${channel}] Mensaje de ${senderId}: ${text}`);

            await handleIncomingMessage(senderId, text, channel, undefined, msgId);
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.sendStatus(404);
  } catch (error) {
    console.error('Error procesando Webhook de Meta:', error);
    return res.status(500).send('Internal Error');
  }
}

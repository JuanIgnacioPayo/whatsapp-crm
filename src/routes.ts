import { Router } from 'express';
import { verifyWebhook, receiveWebhookMessage } from './controllers/webhook.controller';
import {
  getCustomers,
  getCustomerMessages,
  sendOperatorMessage,
  updateCustomerState,
  toggleCustomerTag,
  getProducts,
  getMetadata,
  resetBotState,
  getAllTags,
  createTag,
  updateTag,
  deleteTag,
  deleteAllCustomers
} from './controllers/crm.controller';

import {
  getScheduledMessages,
  createScheduledMessage,
  deleteScheduledMessage
} from './controllers/scheduled-messages.controller';

const router = Router();

// Meta WhatsApp Cloud API Webhook Endpoints
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhookMessage);

// CRM API Endpoints
router.get('/api/customers', getCustomers);
router.delete('/api/customers', deleteAllCustomers);
router.get('/api/customers/:id/messages', getCustomerMessages);
router.post('/api/customers/:id/messages', sendOperatorMessage);
router.patch('/api/customers/:id/state', updateCustomerState);
router.post('/api/customers/:id/tags', toggleCustomerTag);

// Scheduled Messages
router.get('/api/customers/:id/scheduled-messages', getScheduledMessages);
router.post('/api/customers/:id/scheduled-messages', createScheduledMessage);
router.delete('/api/scheduled-messages/:msgId', deleteScheduledMessage);

// Tags CRUD
router.get('/api/tags', getAllTags);
router.post('/api/tags', createTag);
router.put('/api/tags/:id', updateTag);
router.delete('/api/tags/:id', deleteTag);

import {
  getAllQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply
} from './controllers/quickReplies.controller';

// Quick Replies CRUD
router.get('/api/quick-replies', getAllQuickReplies);
router.post('/api/quick-replies', createQuickReply);
router.put('/api/quick-replies/:id', updateQuickReply);
router.delete('/api/quick-replies/:id', deleteQuickReply);

router.get('/api/products', getProducts);
router.get('/api/metadata', getMetadata);
router.post('/api/customers/:id/reset-bot', resetBotState);

import {
  getGlobalBotStatusHandler,
  toggleGlobalBotHandler,
  toggleCustomerBotHandler
} from './controllers/crm.controller';
import { getWhatsAppStatus, disconnectWhatsApp, getPairingCode } from './services/qr.service';

import settingsRouter from './routes/settings.routes';

router.get('/api/qr', (req, res) => {
  res.json(getWhatsAppStatus());
});

router.post('/api/qr/disconnect', async (req, res) => {
  const result = await disconnectWhatsApp();
  res.json(result);
});

router.post('/api/qr/pair', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Se requiere el número de teléfono' });
    const code = await getPairingCode(phoneNumber);
    res.json({ code });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.use('/api/settings', settingsRouter);

router.get('/api/bot/global', getGlobalBotStatusHandler);
router.post('/api/bot/global', toggleGlobalBotHandler);
router.post('/api/customers/:id/toggle-bot', toggleCustomerBotHandler);

export default router;

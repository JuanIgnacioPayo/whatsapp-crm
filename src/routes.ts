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
  resetBotState
} from './controllers/crm.controller';

const router = Router();

// Meta WhatsApp Cloud API Webhook Endpoints
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhookMessage);

// CRM API Endpoints
router.get('/api/customers', getCustomers);
router.get('/api/customers/:id/messages', getCustomerMessages);
router.post('/api/customers/:id/messages', sendOperatorMessage);
router.patch('/api/customers/:id/state', updateCustomerState);
router.post('/api/customers/:id/tags', toggleCustomerTag);
router.get('/api/products', getProducts);
router.get('/api/metadata', getMetadata);
router.post('/api/customers/:id/reset-bot', resetBotState);

export default router;

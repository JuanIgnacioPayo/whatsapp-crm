"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhook_controller_1 = require("./controllers/webhook.controller");
const crm_controller_1 = require("./controllers/crm.controller");
const router = (0, express_1.Router)();
// Meta WhatsApp Cloud API Webhook Endpoints
router.get('/webhook', webhook_controller_1.verifyWebhook);
router.post('/webhook', webhook_controller_1.receiveWebhookMessage);
// CRM API Endpoints
router.get('/api/customers', crm_controller_1.getCustomers);
router.get('/api/customers/:id/messages', crm_controller_1.getCustomerMessages);
router.post('/api/customers/:id/messages', crm_controller_1.sendOperatorMessage);
router.patch('/api/customers/:id/state', crm_controller_1.updateCustomerState);
router.post('/api/customers/:id/tags', crm_controller_1.toggleCustomerTag);
router.get('/api/products', crm_controller_1.getProducts);
router.get('/api/metadata', crm_controller_1.getMetadata);
router.post('/api/customers/:id/reset-bot', crm_controller_1.resetBotState);
const crm_controller_2 = require("./controllers/crm.controller");
router.get('/api/bot/global', crm_controller_2.getGlobalBotStatusHandler);
router.post('/api/bot/global', crm_controller_2.toggleGlobalBotHandler);
router.post('/api/customers/:id/toggle-bot', crm_controller_2.toggleCustomerBotHandler);
exports.default = router;

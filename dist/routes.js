"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhook_controller_1 = require("./controllers/webhook.controller");
const crm_controller_1 = require("./controllers/crm.controller");
const scheduled_messages_controller_1 = require("./controllers/scheduled-messages.controller");
const router = (0, express_1.Router)();
// Meta WhatsApp Cloud API Webhook Endpoints
router.get('/webhook', webhook_controller_1.verifyWebhook);
router.post('/webhook', webhook_controller_1.receiveWebhookMessage);
// CRM API Endpoints
router.get('/api/customers', crm_controller_1.getCustomers);
router.delete('/api/customers', crm_controller_1.deleteAllCustomers);
router.get('/api/customers/:id/messages', crm_controller_1.getCustomerMessages);
router.post('/api/customers/:id/messages', crm_controller_1.sendOperatorMessage);
router.patch('/api/customers/:id/state', crm_controller_1.updateCustomerState);
router.post('/api/customers/:id/tags', crm_controller_1.toggleCustomerTag);
// Scheduled Messages
router.get('/api/customers/:id/scheduled-messages', scheduled_messages_controller_1.getScheduledMessages);
router.post('/api/customers/:id/scheduled-messages', scheduled_messages_controller_1.createScheduledMessage);
router.delete('/api/scheduled-messages/:msgId', scheduled_messages_controller_1.deleteScheduledMessage);
// Tags CRUD
router.get('/api/tags', crm_controller_1.getAllTags);
router.post('/api/tags', crm_controller_1.createTag);
router.put('/api/tags/:id', crm_controller_1.updateTag);
router.delete('/api/tags/:id', crm_controller_1.deleteTag);
const quickReplies_controller_1 = require("./controllers/quickReplies.controller");
// Quick Replies CRUD
router.get('/api/quick-replies', quickReplies_controller_1.getAllQuickReplies);
router.post('/api/quick-replies', quickReplies_controller_1.createQuickReply);
router.put('/api/quick-replies/:id', quickReplies_controller_1.updateQuickReply);
router.delete('/api/quick-replies/:id', quickReplies_controller_1.deleteQuickReply);
router.get('/api/products', crm_controller_1.getProducts);
router.get('/api/metadata', crm_controller_1.getMetadata);
router.post('/api/customers/:id/reset-bot', crm_controller_1.resetBotState);
const crm_controller_2 = require("./controllers/crm.controller");
const qr_service_1 = require("./services/qr.service");
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
router.get('/api/qr', (req, res) => {
    res.json((0, qr_service_1.getWhatsAppStatus)());
});
router.post('/api/qr/disconnect', async (req, res) => {
    const result = await (0, qr_service_1.disconnectWhatsApp)();
    res.json(result);
});
router.post('/api/qr/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber)
            return res.status(400).json({ error: 'Se requiere el número de teléfono' });
        const code = await (0, qr_service_1.getPairingCode)(phoneNumber);
        res.json({ code });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
router.get('/api/logs', (req, res) => {
    const logPath = path_1.default.join(__dirname, '../../baileys.log');
    if (fs_1.default.existsSync(logPath)) {
        res.sendFile(logPath);
    }
    else {
        res.send('No logs available yet. Try connecting first.');
    }
});
router.use('/api/settings', settings_routes_1.default);
router.get('/api/bot/global', crm_controller_2.getGlobalBotStatusHandler);
router.post('/api/bot/global', crm_controller_2.toggleGlobalBotHandler);
router.post('/api/customers/:id/toggle-bot', crm_controller_2.toggleCustomerBotHandler);
exports.default = router;

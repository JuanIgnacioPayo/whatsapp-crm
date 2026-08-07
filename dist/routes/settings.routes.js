"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Get all settings
router.get('/', async (req, res) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        // Convert array of {key, value} to object { key: value }
        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json(settingsMap);
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// Update settings
router.post('/', async (req, res) => {
    try {
        const settingsToUpdate = req.body;
        // settingsToUpdate is expected to be an object like { ignore_groups: 'true', ignore_status: 'true' }
        for (const [key, value] of Object.entries(settingsToUpdate)) {
            await prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            });
        }
        // Reload cache in qr service
        const { loadSystemSettings } = require('../services/qr.service');
        await loadSystemSettings();
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
exports.default = router;

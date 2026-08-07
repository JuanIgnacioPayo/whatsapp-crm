"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteScheduledMessage = exports.createScheduledMessage = exports.getScheduledMessages = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getScheduledMessages = async (req, res) => {
    const { id } = req.params;
    try {
        const scheduled = await prisma.scheduledMessage.findMany({
            where: { customerId: id },
            orderBy: { scheduledAt: 'asc' },
        });
        res.json(scheduled);
    }
    catch (error) {
        console.error('Error obteniendo mensajes programados:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.getScheduledMessages = getScheduledMessages;
const createScheduledMessage = async (req, res) => {
    const { id } = req.params;
    const { text, scheduledAt } = req.body;
    if (!text || !scheduledAt) {
        return res.status(400).json({ error: 'Falta texto o fecha de programación' });
    }
    try {
        const scheduled = await prisma.scheduledMessage.create({
            data: {
                customerId: id,
                text,
                scheduledAt: new Date(scheduledAt),
            },
        });
        res.status(201).json(scheduled);
    }
    catch (error) {
        console.error('Error programando mensaje:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.createScheduledMessage = createScheduledMessage;
const deleteScheduledMessage = async (req, res) => {
    const { msgId } = req.params;
    try {
        await prisma.scheduledMessage.update({
            where: { id: msgId },
            data: { status: 'CANCELLED' }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error cancelando mensaje programado:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.deleteScheduledMessage = deleteScheduledMessage;

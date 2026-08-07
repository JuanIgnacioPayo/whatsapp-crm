"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteQuickReply = exports.updateQuickReply = exports.createQuickReply = exports.getAllQuickReplies = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getAllQuickReplies = async (req, res) => {
    try {
        const replies = await prisma.quickReply.findMany({
            orderBy: { shortcut: 'asc' }
        });
        res.json(replies);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener respuestas rápidas' });
    }
};
exports.getAllQuickReplies = getAllQuickReplies;
const createQuickReply = async (req, res) => {
    try {
        const { shortcut, text } = req.body;
        // Ensure shortcut starts with /
        const formattedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;
        const reply = await prisma.quickReply.create({
            data: { shortcut: formattedShortcut, text }
        });
        res.json(reply);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al crear respuesta rápida. Puede que el atajo ya exista.' });
    }
};
exports.createQuickReply = createQuickReply;
const updateQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        const { shortcut, text } = req.body;
        const formattedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;
        const reply = await prisma.quickReply.update({
            where: { id },
            data: { shortcut: formattedShortcut, text }
        });
        res.json(reply);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al actualizar respuesta rápida' });
    }
};
exports.updateQuickReply = updateQuickReply;
const deleteQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.quickReply.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al eliminar respuesta rápida' });
    }
};
exports.deleteQuickReply = deleteQuickReply;

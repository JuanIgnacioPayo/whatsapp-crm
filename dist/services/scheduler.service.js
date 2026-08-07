"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopScheduler = exports.startScheduler = void 0;
const client_1 = require("@prisma/client");
const message_service_1 = require("./message.service");
const socket_service_1 = require("./socket.service");
const prisma = new client_1.PrismaClient();
let schedulerInterval = null;
const startScheduler = () => {
    if (schedulerInterval)
        return;
    console.log('⏱️  Iniciando servicio de mensajes programados...');
    // Revisar cada 60 segundos
    schedulerInterval = setInterval(async () => {
        try {
            const now = new Date();
            const pendingMessages = await prisma.scheduledMessage.findMany({
                where: {
                    status: 'PENDING',
                    scheduledAt: { lte: now }
                },
                include: {
                    customer: true
                }
            });
            for (const msg of pendingMessages) {
                console.log(`Enviando mensaje programado a ${msg.customer.externalId}...`);
                const result = await (0, message_service_1.sendMessageToCustomer)(msg.customer, msg.text);
                if (result.success) {
                    // Marcar como enviado
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { status: 'SENT' }
                    });
                    // Crear el mensaje real en el chat
                    const savedMessage = await prisma.message.create({
                        data: {
                            customerId: msg.customerId,
                            senderType: 'BOT', // Or maybe 'OPERATOR' with a scheduled tag, let's use 'BOT' for now as requested.
                            text: msg.text + '\n\n_Mensaje programado_',
                            status: 'SENT',
                            channel: msg.customer.channel
                        },
                    });
                    // Notificar al frontend
                    const io = (0, socket_service_1.getIO)();
                    if (io) {
                        io.emit('newMessage', {
                            ...savedMessage,
                            createdAt: savedMessage.createdAt.toISOString()
                        });
                        // Update scheduled messages list in frontend
                        io.emit('scheduledMessageSent', { customerId: msg.customerId, scheduledMessageId: msg.id });
                    }
                }
                else {
                    // Marcar como fallido si hubo error al enviar
                    await prisma.scheduledMessage.update({
                        where: { id: msg.id },
                        data: { status: 'FAILED' }
                    });
                }
            }
        }
        catch (error) {
            console.error('Error en el cron de mensajes programados:', error);
        }
    }, 60000); // 1 minuto
};
exports.startScheduler = startScheduler;
const stopScheduler = () => {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('⏱️  Servicio de mensajes programados detenido.');
    }
};
exports.stopScheduler = stopScheduler;

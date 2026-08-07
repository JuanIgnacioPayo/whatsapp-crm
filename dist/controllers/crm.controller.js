"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomers = getCustomers;
exports.deleteAllCustomers = deleteAllCustomers;
exports.getCustomerMessages = getCustomerMessages;
exports.sendOperatorMessage = sendOperatorMessage;
exports.updateCustomerState = updateCustomerState;
exports.toggleCustomerTag = toggleCustomerTag;
exports.getProducts = getProducts;
exports.getMetadata = getMetadata;
exports.resetBotState = resetBotState;
exports.getGlobalBotStatusHandler = getGlobalBotStatusHandler;
exports.toggleGlobalBotHandler = toggleGlobalBotHandler;
exports.toggleCustomerBotHandler = toggleCustomerBotHandler;
exports.getAllTags = getAllTags;
exports.createTag = createTag;
exports.updateTag = updateTag;
exports.deleteTag = deleteTag;
const client_1 = require("@prisma/client");
const message_service_1 = require("../services/message.service");
const socket_service_1 = require("../services/socket.service");
const prisma = new client_1.PrismaClient();
// 1. Obtener lista de conversaciones filtradas por estado y etiqueta
async function getCustomers(req, res) {
    try {
        const { state, tag } = req.query;
        const whereClause = {};
        if (state && typeof state === 'string') {
            if (state === 'ARCHIVED') {
                whereClause.conversationState = 'ARCHIVED';
            }
            else if (state !== 'ALL') {
                whereClause.conversationState = state;
            }
            else {
                whereClause.conversationState = { not: 'ARCHIVED' };
            }
        }
        else {
            whereClause.conversationState = { not: 'ARCHIVED' };
        }
        if (tag && typeof tag === 'string' && tag !== 'ALL') {
            whereClause.tags = {
                some: {
                    tag: { name: tag }
                }
            };
        }
        const customers = await prisma.customer.findMany({
            where: whereClause,
            include: {
                tags: { include: { tag: true } },
                assignedOperator: true,
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
        const enrichedCustomers = await Promise.all(customers.map(async (cust) => {
            const operatorMsgs = await prisma.message.findMany({
                where: {
                    customerId: cust.id,
                    senderType: 'OPERATOR',
                    operatorName: { not: null }
                },
                select: { operatorName: true },
                distinct: ['operatorName']
            });
            const participatingOperators = operatorMsgs
                .map(m => m.operatorName)
                .filter((name) => Boolean(name));
            return {
                ...cust,
                participatingOperators
            };
        }));
        return res.json(enrichedCustomers);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 1.5. Eliminar TODOS los clientes y mensajes (wipe db)
async function deleteAllCustomers(req, res) {
    try {
        // Delete all customers (Prisma's onDelete: Cascade should delete messages/tags)
        await prisma.customer.deleteMany({});
        res.json({ success: true, message: 'Todos los chats fueron eliminados.' });
    }
    catch (error) {
        console.error('Error wiping customers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
// 2. Obtener historial de mensajes de un cliente
async function getCustomerMessages(req, res) {
    try {
        const { id } = req.params;
        const messages = await prisma.message.findMany({
            where: { customerId: id },
            orderBy: { createdAt: 'asc' }
        });
        return res.json(messages);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 3. Responder a un cliente (Envío por operador)
async function sendOperatorMessage(req, res) {
    try {
        const { id } = req.params;
        const { text, operatorName } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'El texto del mensaje es obligatorio.' });
        }
        const customer = await prisma.customer.findUnique({ where: { id } });
        if (!customer) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }
        // Enviar por el canal correspondiente (WHATSAPP, MESSENGER, INSTAGRAM)
        const sendResult = await (0, message_service_1.sendMessageToCustomer)(customer, text);
        // Guardar en la BD como mensaje de OPERATOR
        const message = await prisma.message.create({
            data: {
                customerId: customer.id,
                senderType: 'OPERATOR',
                operatorName: operatorName || 'Operador',
                text,
                status: sendResult.success ? 'SENT' : 'FAILED',
                metaMessageId: sendResult.messageId,
                channel: customer.channel
            }
        });
        // Actualizar estado del chat a IN_ATTENTION si estaba en PENDING o BOT_ACTIVE
        const updatedCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                conversationState: customer.conversationState === 'CLOSED' ? 'CLOSED' : 'IN_ATTENTION',
                updatedAt: new Date()
            },
            include: { tags: { include: { tag: true } }, assignedOperator: true }
        });
        // Emitir eventos WebSockets
        const operatorMsgs = await prisma.message.findMany({
            where: { customerId: customer.id, senderType: 'OPERATOR', operatorName: { not: null } },
            select: { operatorName: true },
            distinct: ['operatorName']
        });
        const participatingOperators = operatorMsgs.map(m => m.operatorName).filter((n) => Boolean(n));
        const enrichedCustomer = {
            ...updatedCustomer,
            participatingOperators
        };
        (0, socket_service_1.emitOperatorResponse)({ customerId: customer.id, message });
        (0, socket_service_1.emitCustomerUpdate)(enrichedCustomer);
        return res.json({ message, customer: enrichedCustomer });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 4. Actualizar estado del chat (Asignar operador, cerrar chat, etc.)
async function updateCustomerState(req, res) {
    try {
        const { id } = req.params;
        const { state, assignedOperatorId } = req.body;
        const dataToUpdate = { updatedAt: new Date() };
        if (state)
            dataToUpdate.conversationState = state;
        if (assignedOperatorId !== undefined)
            dataToUpdate.assignedOperatorId = assignedOperatorId;
        const updatedCustomer = await prisma.customer.update({
            where: { id },
            data: dataToUpdate,
            include: { tags: { include: { tag: true } }, assignedOperator: true }
        });
        (0, socket_service_1.emitCustomerUpdate)(updatedCustomer);
        return res.json(updatedCustomer);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 5. Agregar / Quitar etiquetas a un cliente
async function toggleCustomerTag(req, res) {
    try {
        const { id } = req.params;
        const { tagName } = req.body;
        let tag = await prisma.tag.findUnique({ where: { name: tagName } });
        if (!tag) {
            tag = await prisma.tag.create({ data: { name: tagName } });
        }
        const existingRelation = await prisma.tagOnCustomer.findUnique({
            where: { customerId_tagId: { customerId: id, tagId: tag.id } }
        });
        if (existingRelation) {
            await prisma.tagOnCustomer.delete({
                where: { customerId_tagId: { customerId: id, tagId: tag.id } }
            });
        }
        else {
            await prisma.tagOnCustomer.create({
                data: { customerId: id, tagId: tag.id }
            });
        }
        const updatedCustomer = await prisma.customer.findUnique({
            where: { id },
            include: { tags: { include: { tag: true } }, assignedOperator: true }
        });
        (0, socket_service_1.emitCustomerUpdate)(updatedCustomer);
        return res.json(updatedCustomer);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 6. Consultar Lista de Precios y Productos (Buscador rápido)
async function getProducts(req, res) {
    try {
        const { search } = req.query;
        let whereClause = {};
        if (search && typeof search === 'string') {
            whereClause = {
                OR: [
                    { name: { contains: search } },
                    { code: { contains: search } },
                    { category: { contains: search } },
                    { description: { contains: search } }
                ]
            };
        }
        const products = await prisma.product.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });
        return res.json(products);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 7. Listar Operadores y Etiquetas disponibles
async function getMetadata(req, res) {
    try {
        const operators = await prisma.user.findMany({ orderBy: { name: 'asc' } });
        const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
        return res.json({
            operators,
            tags,
            whatsappNumber: process.env.META_PHONE_NUMBER || null,
            phoneNumberId: process.env.META_PHONE_NUMBER_ID || null
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 8. Reiniciar Bot (Volver a BOT_ACTIVE)
async function resetBotState(req, res) {
    try {
        const { id } = req.params;
        const updatedCustomer = await prisma.customer.update({
            where: { id },
            data: {
                conversationState: 'BOT_ACTIVE',
                botStep: 'STEP_1_WELCOME',
                profileTag: null,
                updatedAt: new Date()
            },
            include: { tags: { include: { tag: true } }, assignedOperator: true }
        });
        (0, socket_service_1.emitCustomerUpdate)(updatedCustomer);
        return res.json(updatedCustomer);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 9. Control del Bot Global y por Chat Particular
const bot_service_1 = require("../services/bot.service");
const socket_service_2 = require("../services/socket.service");
async function getGlobalBotStatusHandler(req, res) {
    return res.json({ enabled: (0, bot_service_1.getGlobalBotStatus)() });
}
async function toggleGlobalBotHandler(req, res) {
    const { enabled } = req.body;
    const newStatus = (0, bot_service_1.setGlobalBotStatus)(enabled);
    try {
        const io = (0, socket_service_2.getIO)();
        io.emit('global_bot_updated', { enabled: newStatus });
    }
    catch (e) { }
    return res.json({ enabled: newStatus });
}
async function toggleCustomerBotHandler(req, res) {
    try {
        const { id } = req.params;
        const updatedCustomer = await (0, bot_service_1.toggleCustomerBotState)(id);
        return res.json(updatedCustomer);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
// 10. CRUD de Etiquetas Dinámicas (Tags)
async function getAllTags(req, res) {
    try {
        const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
        return res.json(tags);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
async function createTag(req, res) {
    try {
        const { name, color } = req.body;
        if (!name)
            return res.status(400).json({ error: 'El nombre es obligatorio' });
        const tag = await prisma.tag.create({ data: { name, color: color || '#3B82F6' } });
        return res.json(tag);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
async function updateTag(req, res) {
    try {
        const { id } = req.params;
        const { name, color } = req.body;
        const tag = await prisma.tag.update({
            where: { id },
            data: { name, color }
        });
        // Al actualizar el tag, notificar a los clientes conectados para que refresquen
        const io = (0, socket_service_2.getIO)();
        io.emit('tags_updated', tag);
        return res.json(tag);
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
async function deleteTag(req, res) {
    try {
        const { id } = req.params;
        await prisma.tag.delete({ where: { id } });
        const io = (0, socket_service_2.getIO)();
        io.emit('tags_updated', { id, deleted: true });
        return res.json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

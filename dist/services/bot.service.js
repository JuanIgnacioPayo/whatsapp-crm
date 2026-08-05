"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalBotStatus = getGlobalBotStatus;
exports.setGlobalBotStatus = setGlobalBotStatus;
exports.handleIncomingMessage = handleIncomingMessage;
exports.toggleCustomerBotState = toggleCustomerBotState;
const client_1 = require("@prisma/client");
const whatsapp_service_1 = require("./whatsapp.service");
const socket_service_1 = require("./socket.service");
const llm_service_1 = require("./llm.service");
const prisma = new client_1.PrismaClient();
let isGlobalBotEnabled = false;
function getGlobalBotStatus() {
    return isGlobalBotEnabled;
}
function setGlobalBotStatus(enabled) {
    if (typeof enabled === 'boolean') {
        isGlobalBotEnabled = enabled;
    }
    else {
        isGlobalBotEnabled = !isGlobalBotEnabled;
    }
    console.log(`🤖 Bot Global: ${isGlobalBotEnabled ? 'ENCENDIDO' : 'APAGADO'}`);
    return isGlobalBotEnabled;
}
async function handleIncomingMessage(phone, incomingText, name) {
    // 1. Buscar o crear el cliente en la BD
    let customer = await prisma.customer.findUnique({
        where: { phone },
        include: { tags: { include: { tag: true } } }
    });
    if (!customer) {
        customer = await prisma.customer.create({
            data: {
                phone,
                name: name || `Cliente ${phone.slice(-4)}`,
                conversationState: isGlobalBotEnabled ? 'BOT_ACTIVE' : 'PENDING',
                botStep: 'STEP_1_WELCOME'
            },
            include: { tags: { include: { tag: true } } }
        });
    }
    // 2. Registrar mensaje del cliente en la BD
    const userMessage = await prisma.message.create({
        data: {
            customerId: customer.id,
            senderType: 'CUSTOMER',
            text: incomingText,
            status: 'READ'
        }
    });
    // Notificar por WebSockets a todos los operadores
    (0, socket_service_1.emitNewMessage)(userMessage);
    // 3. Evaluar la Máquina de Estados del Bot
    if (isGlobalBotEnabled && customer.conversationState === 'BOT_ACTIVE') {
        await processBotStateMachine(customer, incomingText);
    }
    else {
        // Si la conversación estaba archivada o el bot desactivado, pasar a PENDING/BOT_ACTIVE
        const nextState = customer.conversationState === 'ARCHIVED'
            ? (isGlobalBotEnabled ? 'BOT_ACTIVE' : 'PENDING')
            : (customer.conversationState === 'BOT_ACTIVE' && !isGlobalBotEnabled ? 'PENDING' : customer.conversationState);
        const updated = await prisma.customer.update({
            where: { id: customer.id },
            data: { updatedAt: new Date(), conversationState: nextState },
            include: { tags: { include: { tag: true } }, assignedOperator: true }
        });
        (0, socket_service_1.emitCustomerUpdate)(updated);
    }
    return { customer, userMessage };
}
async function processBotStateMachine(customer, text) {
    // Obtener historial reciente para dar contexto al LLM (últimos 10 mensajes)
    const history = await prisma.message.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    // El LLM necesita el historial ordenado cronológicamente (ascendente)
    // Como lo trajimos desc (para limitar a los últimos 10), le damos la vuelta.
    // IMPORTANTE: quitamos el mensaje recién guardado (el último en desc) para no pasarlo duplicado,
    // ya que processWithLLM lo agrega manualmente.
    const sortedHistory = history.reverse().slice(0, -1);
    // Llamar al LLM
    const response = await (0, llm_service_1.processWithLLM)(sortedHistory, text);
    if (response.type === 'TOOL_CALL' && response.tool === 'transfer_to_agent') {
        const { department, summary } = response.args;
        // Buscar o Vincular etiqueta en la BD
        let tag = await prisma.tag.findUnique({ where: { name: department } });
        if (!tag) {
            tag = await prisma.tag.create({ data: { name: department, color: '#3B82F6' } });
        }
        // Vincular TagOnCustomer
        await prisma.tagOnCustomer.upsert({
            where: { customerId_tagId: { customerId: customer.id, tagId: tag.id } },
            create: { customerId: customer.id, tagId: tag.id },
            update: {}
        });
        // Enviar mensaje de cierre por WhatsApp
        await (0, whatsapp_service_1.sendWhatsAppMessage)(customer.phone, response.text);
        // Guardar mensaje del bot
        const botMsg = await prisma.message.create({
            data: {
                customerId: customer.id,
                senderType: 'BOT',
                text: response.text,
                status: 'SENT'
            }
        });
        (0, socket_service_1.emitNewMessage)(botMsg);
        // Actualizar cliente: Desconectar bot, pasar a PENDING y guardar perfil
        const finalCustomer = await prisma.customer.update({
            where: { id: customer.id },
            data: {
                profileTag: department,
                conversationState: 'PENDING',
                botStep: 'BOT_COMPLETED' // Indicamos que el bot terminó su ciclo
            },
            include: { tags: { include: { tag: true } } }
        });
        // Evento en tiempo real: Se habilita para la cola de atención del CRM
        (0, socket_service_1.emitCustomerUpdate)(finalCustomer);
    }
    else {
        // Si no es un tool call, es una respuesta de texto normal
        await (0, whatsapp_service_1.sendWhatsAppMessage)(customer.phone, response.text);
        // Guardar respuesta del bot en BD
        const botMsg = await prisma.message.create({
            data: {
                customerId: customer.id,
                senderType: 'BOT',
                text: response.text,
                status: 'SENT'
            }
        });
        (0, socket_service_1.emitNewMessage)(botMsg);
    }
}
async function toggleCustomerBotState(customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer)
        throw new Error('Cliente no encontrado');
    const newState = customer.conversationState === 'BOT_ACTIVE' ? 'PENDING' : 'BOT_ACTIVE';
    const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: { conversationState: newState, botStep: 'STEP_1_WELCOME', updatedAt: new Date() },
        include: { tags: { include: { tag: true } }, assignedOperator: true }
    });
    (0, socket_service_1.emitCustomerUpdate)(updatedCustomer);
    return updatedCustomer;
}

import { PrismaClient } from '@prisma/client';
import { sendWhatsAppMessage } from './whatsapp.service';
import { emitNewMessage, emitCustomerUpdate } from './socket.service';
import { processWithLLM } from './llm.service';
const prisma = new PrismaClient();

export async function handleIncomingMessage(phone: string, incomingText: string, name?: string) {
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
        conversationState: 'BOT_ACTIVE',
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
  emitNewMessage(userMessage);

  // 3. Evaluar la Máquina de Estados del Bot
  if (customer.conversationState === 'BOT_ACTIVE') {
    await processBotStateMachine(customer, incomingText);
  } else {
    // Si el bot ya se desconectó, solo actualizamos la última actividad para la cola del CRM
    await prisma.customer.update({
      where: { id: customer.id },
      data: { updatedAt: new Date() }
    });
    emitCustomerUpdate(customer);
  }

  return { customer, userMessage };
}

async function processBotStateMachine(customer: any, text: string) {
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
  const response = await processWithLLM(sortedHistory, text);

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
    await sendWhatsAppMessage(customer.phone, response.text);

    // Guardar mensaje del bot
    const botMsg = await prisma.message.create({
      data: {
        customerId: customer.id,
        senderType: 'BOT',
        text: response.text,
        status: 'SENT'
      }
    });
    emitNewMessage(botMsg);

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
    emitCustomerUpdate(finalCustomer);
  } else {
    // Si no es un tool call, es una respuesta de texto normal
    await sendWhatsAppMessage(customer.phone, response.text);

    // Guardar respuesta del bot en BD
    const botMsg = await prisma.message.create({
      data: {
        customerId: customer.id,
        senderType: 'BOT',
        text: response.text,
        status: 'SENT'
      }
    });
    emitNewMessage(botMsg);
  }
}

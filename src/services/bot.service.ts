import { PrismaClient } from '@prisma/client';
import { sendWhatsAppMessage } from './whatsapp.service';
import { emitNewMessage, emitCustomerUpdate } from './socket.service';

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
  const cleanText = text.trim().toLowerCase();

  // STEP 1: Bienvenida y Primera Pregunta de Perfilado
  if (customer.botStep === 'STEP_1_WELCOME') {
    const welcomeText = 
      `¡Hola ${customer.name || ''}! 👋 Bienvenido a nuestro canal de atención.\n\n` +
      `Para derivarte con el sector correcto, por favor indica qué tipo de cliente eres:\n` +
      `1️⃣ Mayorista 🏭\n` +
      `2️⃣ Minorista 🛒\n` +
      `3️⃣ Soporte Técnico 🛠️\n\n` +
      `Responde únicamente con el número o nombre de tu opción.`;

    await sendWhatsAppMessage(customer.phone, welcomeText);

    // Guardar mensaje del Bot en BD
    const botMsg = await prisma.message.create({
      data: {
        customerId: customer.id,
        senderType: 'BOT',
        text: welcomeText,
        status: 'SENT'
      }
    });
    emitNewMessage(botMsg);

    // Avanzar paso del bot
    const updatedCustomer = await prisma.customer.update({
      where: { id: customer.id },
      data: { botStep: 'STEP_2_PROFILES' },
      include: { tags: { include: { tag: true } } }
    });
    emitCustomerUpdate(updatedCustomer);
    return;
  }

  // STEP 2: Captura del perfil, asignación de etiqueta y traspaso a Humano
  if (customer.botStep === 'STEP_2_PROFILES') {
    let profileTag = 'Minorista';

    if (cleanText.includes('1') || cleanText.includes('mayorista')) {
      profileTag = 'Mayorista';
    } else if (cleanText.includes('3') || cleanText.includes('soporte')) {
      profileTag = 'Soporte';
    }

    // Buscar o Vincular etiqueta en la BD
    let tag = await prisma.tag.findUnique({ where: { name: profileTag } });
    if (!tag) {
      tag = await prisma.tag.create({ data: { name: profileTag, color: '#3B82F6' } });
    }

    // Vincular TagOnCustomer
    await prisma.tagOnCustomer.upsert({
      where: { customerId_tagId: { customerId: customer.id, tagId: tag.id } },
      create: { customerId: customer.id, tagId: tag.id },
      update: {}
    });

    const completionText = 
      `¡Entendido! Te hemos clasificado como **${profileTag}**.\n\n` +
      `🤖 He desconectado el bot automático. Tu chat ha ingresado a la cola de atención de nuestros operadores.\n` +
      `En un momento uno de nuestros asesores responderá a este hilo. ¡Gracias por la paciencia!`;

    await sendWhatsAppMessage(customer.phone, completionText);

    const botMsg = await prisma.message.create({
      data: {
        customerId: customer.id,
        senderType: 'BOT',
        text: completionText,
        status: 'SENT'
      }
    });
    emitNewMessage(botMsg);

    // Actualizar cliente: Desconectar bot y pasar estado a PENDING (cola humana)
    const finalCustomer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        profileTag,
        conversationState: 'PENDING',
        botStep: 'BOT_COMPLETED'
      },
      include: { tags: { include: { tag: true } } }
    });

    // Evento en tiempo real: Se habilita para la cola de atención del CRM
    emitCustomerUpdate(finalCustomer);
  }
}

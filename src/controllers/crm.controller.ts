import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendWhatsAppMessage } from '../services/whatsapp.service';
import { emitNewMessage, emitCustomerUpdate, emitOperatorResponse } from '../services/socket.service';

const prisma = new PrismaClient();

// 1. Obtener lista de conversaciones filtradas por estado y etiqueta
export async function getCustomers(req: Request, res: Response) {
  try {
    const { state, tag } = req.query;

    const whereClause: any = {};
    if (state && typeof state === 'string' && state !== 'ALL') {
      whereClause.conversationState = state;
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

    return res.json(customers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 2. Obtener historial de mensajes de un cliente
export async function getCustomerMessages(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const messages = await prisma.message.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'asc' }
    });
    return res.json(messages);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 3. Responder a un cliente (Envío por operador)
export async function sendOperatorMessage(req: Request, res: Response) {
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

    // Enviar a WhatsApp Cloud API
    const whatsappResult = await sendWhatsAppMessage(customer.phone, text);

    // Guardar en la BD como mensaje de OPERATOR
    const message = await prisma.message.create({
      data: {
        customerId: customer.id,
        senderType: 'OPERATOR',
        operatorName: operatorName || 'Operador',
        text,
        status: whatsappResult.success ? 'SENT' : 'FAILED',
        metaMessageId: whatsappResult.messageId
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
    emitOperatorResponse({ customerId: customer.id, message });
    emitCustomerUpdate(updatedCustomer);

    return res.json({ message, customer: updatedCustomer });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 4. Actualizar estado del chat (Asignar operador, cerrar chat, etc.)
export async function updateCustomerState(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { state, assignedOperatorId } = req.body;

    const dataToUpdate: any = { updatedAt: new Date() };
    if (state) dataToUpdate.conversationState = state;
    if (assignedOperatorId !== undefined) dataToUpdate.assignedOperatorId = assignedOperatorId;

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: dataToUpdate,
      include: { tags: { include: { tag: true } }, assignedOperator: true }
    });

    emitCustomerUpdate(updatedCustomer);
    return res.json(updatedCustomer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 5. Agregar / Quitar etiquetas a un cliente
export async function toggleCustomerTag(req: Request, res: Response) {
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
    } else {
      await prisma.tagOnCustomer.create({
        data: { customerId: id, tagId: tag.id }
      });
    }

    const updatedCustomer = await prisma.customer.findUnique({
      where: { id },
      include: { tags: { include: { tag: true } }, assignedOperator: true }
    });

    emitCustomerUpdate(updatedCustomer);
    return res.json(updatedCustomer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 6. Consultar Lista de Precios y Productos (Buscador rápido)
export async function getProducts(req: Request, res: Response) {
  try {
    const { search } = req.query;
    let whereClause: any = {};

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
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 7. Listar Operadores y Etiquetas disponibles
export async function getMetadata(req: Request, res: Response) {
  try {
    const operators = await prisma.user.findMany({ orderBy: { name: 'asc' } });
    const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
    return res.json({
      operators,
      tags,
      whatsappNumber: process.env.META_PHONE_NUMBER || null,
      phoneNumberId: process.env.META_PHONE_NUMBER_ID || null
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

// 8. Reiniciar Bot (Volver a BOT_ACTIVE)
export async function resetBotState(req: Request, res: Response) {
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

    emitCustomerUpdate(updatedCustomer);
    return res.json(updatedCustomer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

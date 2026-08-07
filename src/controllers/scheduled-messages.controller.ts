import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getScheduledMessages = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const scheduled = await prisma.scheduledMessage.findMany({
      where: { customerId: id },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json(scheduled);
  } catch (error) {
    console.error('Error obteniendo mensajes programados:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const createScheduledMessage = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error programando mensaje:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const deleteScheduledMessage = async (req: Request, res: Response) => {
  const { msgId } = req.params;
  try {
    await prisma.scheduledMessage.update({
      where: { id: msgId },
      data: { status: 'CANCELLED' }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelando mensaje programado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

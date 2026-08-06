import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllQuickReplies = async (req: Request, res: Response) => {
  try {
    const replies = await prisma.quickReply.findMany({
      orderBy: { shortcut: 'asc' }
    });
    res.json(replies);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener respuestas rápidas' });
  }
};

export const createQuickReply = async (req: Request, res: Response) => {
  try {
    const { shortcut, text } = req.body;
    
    // Ensure shortcut starts with /
    const formattedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;
    
    const reply = await prisma.quickReply.create({
      data: { shortcut: formattedShortcut, text }
    });
    res.json(reply);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear respuesta rápida. Puede que el atajo ya exista.' });
  }
};

export const updateQuickReply = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { shortcut, text } = req.body;
    
    const formattedShortcut = shortcut.startsWith('/') ? shortcut : `/${shortcut}`;
    
    const reply = await prisma.quickReply.update({
      where: { id },
      data: { shortcut: formattedShortcut, text }
    });
    res.json(reply);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar respuesta rápida' });
  }
};

export const deleteQuickReply = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.quickReply.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar respuesta rápida' });
  }
};

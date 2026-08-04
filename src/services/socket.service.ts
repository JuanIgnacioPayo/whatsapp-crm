import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH']
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Operador conectado a WebSockets (ID: ${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`❌ Operador desconectado (ID: ${socket.id})`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io no ha sido inicializado.');
  }
  return io;
}

export function emitNewMessage(message: any) {
  if (io) {
    io.emit('new_message', message);
  }
}

export function emitCustomerUpdate(customer: any) {
  if (io) {
    io.emit('customer_updated', customer);
  }
}

export function emitOperatorResponse(data: { customerId: string; message: any }) {
  if (io) {
    io.emit('operator_response', data);
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.getIO = getIO;
exports.emitNewMessage = emitNewMessage;
exports.emitCustomerUpdate = emitCustomerUpdate;
exports.emitOperatorResponse = emitOperatorResponse;
const socket_io_1 = require("socket.io");
let io = null;
function initSocketServer(httpServer) {
    io = new socket_io_1.Server(httpServer, {
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
function getIO() {
    if (!io) {
        throw new Error('Socket.io no ha sido inicializado.');
    }
    return io;
}
function emitNewMessage(message) {
    if (io) {
        io.emit('new_message', message);
    }
}
function emitCustomerUpdate(customer) {
    if (io) {
        io.emit('customer_updated', customer);
    }
}
function emitOperatorResponse(data) {
    if (io) {
        io.emit('operator_response', data);
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePrismaAuthState = void 0;
const baileys_1 = require("@whiskeysockets/baileys");
const usePrismaAuthState = async (sessionId, prisma) => {
    // Caché en memoria para evitar latencia de base de datos durante el escaneo del QR
    const memoryCache = new Map();
    let isWriting = false;
    const writeQueue = [];
    const processWriteQueue = async () => {
        if (isWriting || writeQueue.length === 0)
            return;
        isWriting = true;
        while (writeQueue.length > 0) {
            const task = writeQueue.shift();
            if (task) {
                try {
                    await task();
                }
                catch (e) {
                    console.error('Error en write queue de PrismaAuth:', e);
                }
            }
        }
        isWriting = false;
    };
    const writeData = async (data, id) => {
        // 1. Guardar en caché instantáneamente
        const dataString = JSON.stringify(data, baileys_1.BufferJSON.replacer);
        memoryCache.set(id, dataString);
        // 2. Encolar la escritura en la DB
        writeQueue.push(async () => {
            try {
                await prisma.baileysSession.upsert({
                    where: { sessionId_id: { sessionId, id } },
                    create: { sessionId, id, data: dataString },
                    update: { data: dataString }
                });
            }
            catch (e) {
                console.error(`Error escribiendo auth data para ${id}:`, e);
            }
        });
        // Procesar asíncronamente sin bloquear
        processWriteQueue();
    };
    const readData = async (id) => {
        // 1. Intentar leer de la caché primero
        if (memoryCache.has(id)) {
            const cached = memoryCache.get(id);
            return JSON.parse(cached, baileys_1.BufferJSON.reviver);
        }
        // 2. Si no está en caché, leer de la DB
        try {
            const session = await prisma.baileysSession.findUnique({
                where: { sessionId_id: { sessionId, id } }
            });
            if (session) {
                memoryCache.set(id, session.data); // Guardar en caché para futuras lecturas
                return JSON.parse(session.data, baileys_1.BufferJSON.reviver);
            }
        }
        catch (e) {
            console.error(`Error leyendo auth data para ${id}:`, e);
        }
        return null;
    };
    const removeData = async (id) => {
        // 1. Borrar de caché
        memoryCache.delete(id);
        // 2. Encolar borrado en la DB
        writeQueue.push(async () => {
            try {
                await prisma.baileysSession.delete({
                    where: { sessionId_id: { sessionId, id } }
                });
            }
            catch (e) {
                // Ignorar si no existe
            }
        });
        processWriteQueue();
    };
    // Precargar creds al iniciar
    const creds = (await readData('creds')) || (0, baileys_1.initAuthCreds)();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = baileys_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                await writeData(value, key);
                            }
                            else {
                                await removeData(key);
                            }
                        }
                    }
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        }
    };
};
exports.usePrismaAuthState = usePrismaAuthState;

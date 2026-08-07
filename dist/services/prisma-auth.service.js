"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePrismaAuthState = void 0;
const baileys_1 = require("@whiskeysockets/baileys");
const usePrismaAuthState = async (sessionId, prisma) => {
    const writeData = async (data, id) => {
        try {
            const dataString = JSON.stringify(data, baileys_1.BufferJSON.replacer);
            await prisma.baileysSession.upsert({
                where: { sessionId_id: { sessionId, id } },
                create: { sessionId, id, data: dataString },
                update: { data: dataString }
            });
        }
        catch (e) {
            console.error(`Error writing auth data for ${id}:`, e);
        }
    };
    const readData = async (id) => {
        try {
            const session = await prisma.baileysSession.findUnique({
                where: { sessionId_id: { sessionId, id } }
            });
            if (session) {
                return JSON.parse(session.data, baileys_1.BufferJSON.reviver);
            }
        }
        catch (e) {
            console.error(`Error reading auth data for ${id}:`, e);
        }
        return null;
    };
    const removeData = async (id) => {
        try {
            await prisma.baileysSession.delete({
                where: { sessionId_id: { sessionId, id } }
            });
        }
        catch (e) {
            // Ignore if not exists
        }
    };
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
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, key));
                            }
                            else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        }
    };
};
exports.usePrismaAuthState = usePrismaAuthState;

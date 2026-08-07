import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';

export const usePrismaAuthState = async (sessionId: string, prisma: PrismaClient) => {
  const writeData = async (data: any, id: string) => {
    try {
      const dataString = JSON.stringify(data, BufferJSON.replacer);
      await prisma.baileysSession.upsert({
        where: { sessionId_id: { sessionId, id } },
        create: { sessionId, id, data: dataString },
        update: { data: dataString }
      });
    } catch (e) {
      console.error(`Error writing auth data for ${id}:`, e);
    }
  };

  const readData = async (id: string) => {
    try {
      const session = await prisma.baileysSession.findUnique({
        where: { sessionId_id: { sessionId, id } }
      });
      if (session) {
        return JSON.parse(session.data, BufferJSON.reviver);
      }
    } catch (e) {
      console.error(`Error reading auth data for ${id}:`, e);
    }
    return null;
  };

  const removeData = async (id: string) => {
    try {
      await prisma.baileysSession.delete({
        where: { sessionId_id: { sessionId, id } }
      });
    } catch (e) {
      // Ignore if not exists
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<any>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, key));
              } else {
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

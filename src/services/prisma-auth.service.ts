import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';

export const usePrismaAuthState = async (sessionId: string, prisma: PrismaClient) => {
  // Caché en memoria para evitar latencia de base de datos durante el escaneo del QR
  const memoryCache = new Map<string, any>();
  let isWriting = false;
  const writeQueue: Array<() => Promise<void>> = [];

  const processWriteQueue = async () => {
    if (isWriting || writeQueue.length === 0) return;
    isWriting = true;
    while (writeQueue.length > 0) {
      const task = writeQueue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          console.error('Error en write queue de PrismaAuth:', e);
        }
      }
    }
    isWriting = false;
  };

  const writeData = async (data: any, id: string) => {
    // 1. Guardar en caché instantáneamente
    const dataString = JSON.stringify(data, BufferJSON.replacer);
    memoryCache.set(id, dataString);

    // 2. Encolar la escritura en la DB
    writeQueue.push(async () => {
      try {
        await prisma.baileysSession.upsert({
          where: { sessionId_id: { sessionId, id } },
          create: { sessionId, id, data: dataString },
          update: { data: dataString }
        });
      } catch (e) {
        console.error(`Error escribiendo auth data para ${id}:`, e);
      }
    });
    
    // Procesar asíncronamente sin bloquear
    processWriteQueue();
  };

  const readData = async (id: string) => {
    // 1. Intentar leer de la caché primero
    if (memoryCache.has(id)) {
      const cached = memoryCache.get(id);
      return JSON.parse(cached, BufferJSON.reviver);
    }

    // 2. Si no está en caché, leer de la DB
    try {
      const session = await prisma.baileysSession.findUnique({
        where: { sessionId_id: { sessionId, id } }
      });
      if (session) {
        memoryCache.set(id, session.data); // Guardar en caché para futuras lecturas
        return JSON.parse(session.data, BufferJSON.reviver);
      }
    } catch (e) {
      console.error(`Error leyendo auth data para ${id}:`, e);
    }
    return null;
  };

  const removeData = async (id: string) => {
    // 1. Borrar de caché
    memoryCache.delete(id);

    // 2. Encolar borrado en la DB
    writeQueue.push(async () => {
      try {
        await prisma.baileysSession.delete({
          where: { sessionId_id: { sessionId, id } }
        });
      } catch (e) {
        // Ignorar si no existe
      }
    });

    processWriteQueue();
  };

  // Precargar creds al iniciar
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
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                await writeData(value, key);
              } else {
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

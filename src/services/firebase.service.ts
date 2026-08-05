import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let db: admin.firestore.Firestore | null = null;

const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log('✅ Firebase Admin SDK inicializado correctamente.');
  } catch (err) {
    console.error('❌ Error al inicializar Firebase Admin:', err);
  }
} else {
  console.warn('⚠️ No se encontró firebase-service-account.json en la raíz del proyecto.');
  console.warn('⚠️ La sincronización de la URL del túnel en Firestore estará desactivada.');
}

export async function updateTunnelUrlInFirestore(url: string) {
  if (!db) return;
  try {
    await db.collection('config').doc('backend').set({
      url,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`📡 URL del túnel sincronizada en Firestore: ${url}`);
  } catch (err) {
    console.error('❌ Error al actualizar la URL del túnel en Firestore:', err);
  }
}

export { db };

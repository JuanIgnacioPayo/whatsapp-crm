"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.updateTunnelUrlInFirestore = updateTunnelUrlInFirestore;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let db = null;
exports.db = db;
const serviceAccountPath = path_1.default.join(__dirname, '../../firebase-service-account.json');
if (fs_1.default.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = require(serviceAccountPath);
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)(serviceAccount)
        });
        exports.db = db = (0, firestore_1.getFirestore)();
        console.log('✅ Firebase Admin SDK inicializado correctamente.');
    }
    catch (err) {
        console.error('❌ Error al inicializar Firebase Admin:', err);
    }
}
else {
    console.warn('⚠️ No se encontró firebase-service-account.json en la raíz del proyecto.');
    console.warn('⚠️ La sincronización de la URL del túnel en Firestore estará desactivada.');
}
async function updateTunnelUrlInFirestore(url) {
    if (!db)
        return;
    try {
        await db.collection('config').doc('backend').set({
            url,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`📡 URL del túnel sincronizada en Firestore: ${url}`);
    }
    catch (err) {
        console.error('❌ Error al actualizar la URL del túnel en Firestore:', err);
    }
}

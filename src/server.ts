import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import routes from './routes';
import { initSocketServer } from './services/socket.service';

dotenv.config();

import { execSync } from 'child_process';
try {
  console.log('🔄 Verificando y sincronizando esquema de base de datos Prisma...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
} catch (e) {
  console.error('Error al sincronizar esquema Prisma:', e);
}

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import { initBaileysEngine } from './services/qr.service';
import { startScheduler } from './services/scheduler.service';

// Socket.io initialization
initSocketServer(server);

// Baileys WhatsApp Engine initialization
initBaileysEngine();

// Start Scheduled Messages cron
startScheduler();

// Routes
app.use('/', routes);

// Servir frontend en http://localhost:3000
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return next();
  }
  res.sendFile(path.join(clientPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 CRM WhatsApp Backend corriendo en puerto ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`=================================================`);
});

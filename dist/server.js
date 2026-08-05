"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const socket_service_1 = require("./services/socket.service");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const qr_service_1 = require("./services/qr.service");
// Socket.io initialization
(0, socket_service_1.initSocketServer)(server);
// Baileys WhatsApp Engine initialization
(0, qr_service_1.initBaileysEngine)();
// Routes
app.use('/', routes_1.default);
// Servir frontend en http://localhost:3000
const clientPath = path_1.default.join(__dirname, '../client');
app.use(express_1.default.static(clientPath));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
        return next();
    }
    res.sendFile(path_1.default.join(clientPath, 'index.html'));
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 CRM WhatsApp Backend corriendo en puerto ${PORT}`);
    console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`=================================================`);
});

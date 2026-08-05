"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWithLLM = processWithLLM;
const genai_1 = require("@google/genai");
const ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Declaración de la Herramienta (Tool) para derivar al agente
const transferToAgentTool = {
    name: 'transfer_to_agent',
    description: 'Deriva la conversación a un operador humano. Utiliza esta herramienta SÓLO cuando ya has identificado el perfil del cliente (Mayorista, Minorista o Soporte) y el cliente te ha dado el motivo de su consulta o ha solicitado explícitamente hablar con un humano.',
    parameters: {
        type: genai_1.Type.OBJECT,
        properties: {
            department: {
                type: genai_1.Type.STRING,
                description: 'El departamento al que se derivará el cliente.',
                enum: ['Mayorista', 'Minorista', 'Soporte']
            },
            summary: {
                type: genai_1.Type.STRING,
                description: 'Un breve resumen de la consulta o motivo del cliente para que el operador sepa de qué se trata.'
            }
        },
        required: ['department', 'summary']
    }
};
const SYSTEM_INSTRUCTION = `Eres el asistente virtual inicial de WhatsApp de nuestra empresa (CRM Inteligente). 
Tu trabajo es actuar como recepcionista:
1. Saluda amablemente y preséntate.
2. Tu objetivo principal es perfilar al cliente: averigua si es Mayorista, Minorista, o si requiere Soporte Técnico.
3. Pregunta en qué puedes ayudarle.
4. Mantén un tono cálido, empático, natural y profesional. Tus respuestas deben ser breves y aptas para WhatsApp (usa emojis).
5. UNA VEZ que tengas claro el perfil del cliente (Mayorista/Minorista/Soporte) Y el motivo de su consulta, DEBES usar la herramienta 'transfer_to_agent' para derivarlo. No intentes resolver el problema tú mismo si no es tu rol, solo deriva al equipo correcto.`;
async function processWithLLM(history, incomingText) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
        return {
            type: 'TEXT',
            text: '🤖 ¡Hola! Gracias por comunicarte con nuestro servicio de atención. En un momento un asesor humano de nuestro equipo tomará tu consulta. ¡Muchas gracias por tu paciencia!'
        };
    }
    // Formatear el historial para el modelo
    // history debe contener { senderType, text } ordenado cronológicamente
    const contents = history.map(msg => ({
        role: msg.senderType === 'BOT' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));
    // Agregar el mensaje actual
    contents.push({ role: 'user', parts: [{ text: incomingText }] });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: contents,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ functionDeclarations: [transferToAgentTool] }],
                temperature: 0.7,
            }
        });
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            // El modelo decidió llamar a una herramienta
            const call = functionCalls[0];
            if (call.name === 'transfer_to_agent') {
                const { department, summary } = call.args;
                return {
                    type: 'TOOL_CALL',
                    tool: 'transfer_to_agent',
                    args: { department, summary },
                    text: `¡Entendido! Te hemos clasificado como **${department}**.\n\n🤖 He desconectado el bot automático. Tu chat ha ingresado a la cola de atención de nuestros operadores.\nEn un momento un asesor responderá a este hilo. ¡Gracias por la paciencia!`
                };
            }
        }
        // Respuesta de texto normal
        return {
            type: 'TEXT',
            text: response.text || 'Ha ocurrido un error al procesar tu solicitud.'
        };
    }
    catch (error) {
        console.error('Error in processWithLLM:', error);
        return {
            type: 'TEXT',
            text: 'Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, aguarda y un humano te atenderá.'
        };
    }
}

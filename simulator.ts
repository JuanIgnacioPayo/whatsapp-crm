import axios from 'axios';

const SERVER_URL = 'http://localhost:3000/webhook';

async function simulateIncomingMessage(phone: string, name: string, text: string) {
  console.log(`\n📱 Simulando cliente (${name} - ${phone}): "${text}"`);
  try {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '123456789', phone_number_id: '123456789' },
                contacts: [{ profile: { name } }],
                messages: [
                  {
                    from: phone,
                    id: `wamid.sim_${Date.now()}`,
                    timestamp: `${Math.floor(Date.now() / 1000)}`,
                    text: { body: text },
                    type: 'text'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const res = await axios.post(SERVER_URL, payload);
    console.log(`✅ Servidor respondió: HTTP ${res.status}`);
  } catch (error: any) {
    console.error(`❌ Error en simulador: ${error.message}`);
  }
}

async function runDemoScenario() {
  console.log('🚀 Iniciando Simulación de Chat de Prueba con Bot y Triaje...');

  const testPhone = '5491198765432';
  const testName = 'Juan Pérez';

  // Paso 1: Cliente escribe por primera vez
  await simulateIncomingMessage(testPhone, testName, 'Hola, buenas tardes, quisiera información');
  
  // Esperar 2 segundos
  await new Promise((r) => setTimeout(r, 2000));

  // Paso 2: Cliente responde a la pregunta de triaje eligiendo opción 1 (Mayorista)
  await simulateIncomingMessage(testPhone, testName, '1');

  console.log('\n✨ Simulación completada. Revisa la base de datos o la consola del servidor.');
}

// Ejecutar si se corre directamente
if (require.main === module) {
  runDemoScenario();
}

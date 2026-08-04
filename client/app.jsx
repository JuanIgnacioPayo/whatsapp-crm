const { useState, useEffect, useRef } = React;

const API_BASE = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

function App() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [products, setProducts] = useState([]);
  const [metadata, setMetadata] = useState({ operators: [], tags: [] });
  
  // Filtros
  const [stateFilter, setStateFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearch, setProductSearch] = useState('');
  
  // Estado del operador activo
  const [currentOperator, setCurrentOperator] = useState('Carlos Gómez (Ventas)');
  const [replyText, setReplyText] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const messagesEndRef = useRef(null);

  // Inicializar WebSockets y cargar datos
  useEffect(() => {
    fetchMetadata();
    fetchCustomers();
    fetchProducts('');

    // Conectar a Socket.io
    const socket = io(SOCKET_URL);

    socket.on('connect', () => setIsSocketConnected(true));
    socket.on('disconnect', () => setIsSocketConnected(false));

    socket.on('new_message', (newMsg) => {
      setMessages((prev) => (prev.length > 0 && prev[0].customerId === newMsg.customerId ? [...prev, newMsg] : prev));
      fetchCustomers();
    });

    socket.on('customer_updated', (updatedCust) => {
      setCustomers((prev) => {
        const index = prev.findIndex((c) => c.id === updatedCust.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedCust;
          return next;
        }
        return [updatedCust, ...prev];
      });
    });

    socket.on('operator_response', (data) => {
      setMessages((prev) => (prev.length > 0 && prev[0].customerId === data.customerId ? [...prev, data.message] : prev));
      fetchCustomers();
    });

    return () => socket.disconnect();
  }, []);

  // Cargar mensajes cuando cambia el cliente seleccionado
  useEffect(() => {
    if (selectedCustomerId) {
      fetchMessages(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  // Scroll al final del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE}/customers?state=${stateFilter}&tag=${tagFilter}`);
      const data = await res.json();
      setCustomers(data);
      if (data.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMessages = async (customerId) => {
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async (query) => {
    try {
      const res = await fetch(`${API_BASE}/products?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMetadata = async () => {
    try {
      const res = await fetch(`${API_BASE}/metadata`);
      const data = await res.json();
      setMetadata(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Enviar respuesta desde el CRM
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || !selectedCustomerId) return;

    const textToSend = replyText;
    setReplyText('');

    try {
      await fetch(`${API_BASE}/customers/${selectedCustomerId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, operatorName: currentOperator })
      });
      fetchMessages(selectedCustomerId);
    } catch (e) {
      console.error(e);
    }
  };

  // Cambiar estado del chat (Ej: Tomar atención / Cerrar)
  const handleUpdateState = async (newState, operatorId = null) => {
    if (!selectedCustomerId) return;
    try {
      await fetch(`${API_BASE}/customers/${selectedCustomerId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState, assignedOperatorId: operatorId })
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle Etiqueta del cliente
  const handleToggleTag = async (tagName) => {
    if (!selectedCustomerId) return;
    try {
      await fetch(`${API_BASE}/customers/${selectedCustomerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagName })
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  // Simular Mensaje Entrante de Prueba
  const handleSimulateMessage = async () => {
    setIsSimulating(true);
    try {
      const randomPhone = `54911${Math.floor(10000000 + Math.random() * 90000000)}`;
      await fetch('http://localhost:3000/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object: 'whatsapp_business_account',
          entry: [{
            changes: [{
              value: {
                contacts: [{ profile: { name: 'Cliente Demo' } }],
                messages: [{ from: randomPhone, text: { body: 'Hola! Buenas tardes, quiero consultar precios' }, type: 'text' }]
              }
            }]
          }]
        })
      });
      setTimeout(() => fetchCustomers(), 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Filtrado de clientes en cliente
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.messages[0]?.text || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = stateFilter === 'ALL' || c.conversationState === stateFilter;
    const matchesTag = tagFilter === 'ALL' || c.profileTag === tagFilter || c.tags?.some((t) => t.tag.name === tagFilter);
    return matchesSearch && matchesState && matchesTag;
  });

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-gray-100">
      {/* 1. TOP NAVBAR */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-lg">
            WA
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-emerald-400">WhatsApp CRM Multioperador</h1>
            <p className="text-xs text-gray-400">
              {metadata.whatsappNumber ? `📞 ${metadata.whatsappNumber}` : metadata.phoneNumberId ? `🆔 Teléfono: ${metadata.phoneNumberId}` : 'Meta Cloud API Native'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Indicador de conexión real-time */}
          <div className="flex items-center space-x-2 bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-700 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${isSocketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-gray-300">{isSocketConnected ? 'WebSockets Activo' : 'Desconectado'}</span>
          </div>

          {/* Botón de simulación local */}
          <button
            onClick={handleSimulateMessage}
            disabled={isSimulating}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-md text-xs font-medium transition shadow"
          >
            🧪 {isSimulating ? 'Simulando...' : 'Simular Chat Entrante'}
          </button>

          {/* Selector de Operador */}
          <div className="flex items-center space-x-2 text-xs bg-gray-700 px-3 py-1.5 rounded-md border border-gray-600">
            <span className="text-gray-400">Operador:</span>
            <select
              value={currentOperator}
              onChange={(e) => setCurrentOperator(e.target.value)}
              className="bg-transparent font-medium text-emerald-300 focus:outline-none cursor-pointer"
            >
              <option value="Carlos Gómez (Ventas)">Carlos Gómez (Ventas)</option>
              <option value="Sofía Martínez (Soporte)">Sofía Martínez (Soporte)</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </div>
      </header>

      {/* 2. MAIN LAYOUT (3 PANELES) */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* PANEL IZQUIERDO: SIDEBAR DE CHATS */}
        <aside className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
          {/* Filtros por Estado */}
          <div className="p-3 border-b border-gray-700 space-y-2">
            <div className="grid grid-cols-3 gap-1 text-[11px] font-medium">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'BOT_ACTIVE', label: '🤖 Bot' },
                { id: 'PENDING', label: '⏳ Pendiente' },
                { id: 'IN_ATTENTION', label: '💬 En Atención' },
                { id: 'CLOSED', label: '✅ Cerrado' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStateFilter(f.id)}
                  className={`py-1.5 px-2 rounded-md transition text-center truncate ${
                    stateFilter === f.id ? 'bg-emerald-600 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Buscador de Chats */}
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Lista de Conversaciones */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
            {filteredCustomers.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500">
                No se encontraron conversaciones en esta vista.
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = cust.id === selectedCustomerId;
                const lastMsg = cust.messages?.[0];

                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`p-3 cursor-pointer transition flex items-start space-x-3 ${
                      isSelected ? 'bg-gray-700/80 border-l-4 border-emerald-500' : 'hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center font-bold text-gray-200 shrink-0">
                      {cust.name ? cust.name.charAt(0).toUpperCase() : 'C'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold truncate text-gray-200">{cust.name || cust.phone}</h3>
                        <span className="text-[10px] text-gray-400">
                          {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {lastMsg ? lastMsg.text : 'Sin mensajes'}
                      </p>

                      {/* Badges de Estado y Etiqueta */}
                      <div className="flex items-center space-x-1.5 mt-2">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                            cust.conversationState === 'BOT_ACTIVE' ? 'bg-blue-900/80 text-blue-300' :
                            cust.conversationState === 'PENDING' ? 'bg-amber-900/80 text-amber-300' :
                            cust.conversationState === 'IN_ATTENTION' ? 'bg-emerald-900/80 text-emerald-300' :
                            'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {cust.conversationState}
                        </span>

                        {cust.profileTag && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/70 text-purple-300 font-medium">
                            {cust.profileTag}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* PANEL CENTRAL: VISTA DEL CHAT */}
        <main className="flex-1 flex flex-col bg-gray-900 relative min-w-0">
          {selectedCustomer ? (
            <>
              {/* Header del Chat */}
              <div className="h-14 bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white">
                    {selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'C'}
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-gray-100">{selectedCustomer.name || 'Cliente sin nombre'}</h2>
                    <p className="text-[11px] text-gray-400">{selectedCustomer.phone}</p>
                  </div>
                </div>

                {/* Acciones de Estado del Chat */}
                <div className="flex items-center space-x-2">
                  {selectedCustomer.conversationState === 'PENDING' && (
                    <button
                      onClick={() => handleUpdateState('IN_ATTENTION')}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded font-medium shadow"
                    >
                      ✋ Tomar Atención
                    </button>
                  )}

                  {selectedCustomer.conversationState !== 'CLOSED' ? (
                    <button
                      onClick={() => handleUpdateState('CLOSED')}
                      className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded font-medium"
                    >
                      ✅ Resolver y Cerrar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateState('IN_ATTENTION')}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-medium"
                    >
                      🔄 Reabrir Chat
                    </button>
                  )}
                </div>
              </div>

              {/* Historial de Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
                {messages.map((m) => {
                  const isCustomer = m.senderType === 'CUSTOMER';
                  const isBot = m.senderType === 'BOT';
                  const isOperator = m.senderType === 'OPERATOR';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        isCustomer ? 'items-start' : isOperator ? 'items-end' : 'items-center'
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3.5 py-2 text-xs shadow ${
                          isCustomer
                            ? 'bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700'
                            : isOperator
                            ? 'bg-emerald-700 text-white rounded-tr-none'
                            : 'bg-indigo-900/90 text-indigo-100 border border-indigo-700 rounded-md text-center'
                        }`}
                      >
                        {/* Remitente Header */}
                        <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 space-x-2">
                          <span className="font-semibold">
                            {isCustomer ? selectedCustomer.name || 'Cliente' : isBot ? '🤖 Bot Automático' : `👤 ${m.operatorName || 'Operador'}`}
                          </span>
                          <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                        {/* Indicadores de Estado de WhatsApp */}
                        {isOperator && (
                          <div className="text-[10px] text-right mt-1 text-emerald-200">
                            {m.status === 'SENT' ? '✓ Enviado' : m.status === 'READ' ? '✓✓ Leído' : '✓✓ Entregado'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Caja de Texto para Responder */}
              <form onSubmit={handleSendMessage} className="p-3 bg-gray-800 border-t border-gray-700 flex items-center space-x-2 shrink-0">
                <input
                  type="text"
                  placeholder={`Responder como ${currentOperator}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow transition"
                >
                  Enviar 🚀
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
              Selecciona una conversación del panel izquierdo para comenzar a chatear.
            </div>
          )}
        </main>

        {/* PANEL DERECHO: FICHA DE CLIENTE Y CONSULTA DE PRECIOS */}
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
          {selectedCustomer ? (
            <div className="p-4 space-y-5 overflow-y-auto flex-1">
              
              {/* Información del Cliente */}
              <div className="text-center space-y-2 border-b border-gray-700 pb-4">
                <div className="w-16 h-16 rounded-full bg-emerald-600 mx-auto flex items-center justify-center text-xl font-bold text-white shadow">
                  {selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'C'}
                </div>
                <h3 className="text-sm font-semibold text-gray-100">{selectedCustomer.name || 'Cliente'}</h3>
                <p className="text-xs text-gray-400">{selectedCustomer.phone}</p>
                <div className="inline-block bg-purple-900/60 text-purple-300 text-xs px-2.5 py-0.5 rounded font-medium">
                  {selectedCustomer.profileTag || 'Sin Triaje'}
                </div>
              </div>

              {/* Asignación de Etiquetas */}
              <div className="space-y-2 border-b border-gray-700 pb-4">
                <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Etiquetas del Cliente</h4>
                <div className="flex flex-wrap gap-1.5">
                  {['Mayorista', 'Minorista', 'Soporte', 'VIP', 'Urgente'].map((tagName) => {
                    const hasTag = selectedCustomer.tags?.some((t) => t.tag.name === tagName);
                    return (
                      <button
                        key={tagName}
                        onClick={() => handleToggleTag(tagName)}
                        className={`text-[11px] px-2 py-1 rounded transition ${
                          hasTag
                            ? 'bg-emerald-600 text-white font-medium'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {hasTag ? `✓ ${tagName}` : `+ ${tagName}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buscador / Consulta Rápida de Lista de Precios e Inventario */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">📦 Catálogo de Precios</h4>
                  <span className="text-[10px] text-emerald-400">En tiempo real</span>
                </div>

                <input
                  type="text"
                  placeholder="Buscar producto o código..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    fetchProducts(e.target.value);
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                />

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {products.map((p) => (
                    <div key={p.id} className="bg-gray-900/80 p-2.5 rounded border border-gray-700 text-xs space-y-1">
                      <div className="flex justify-between font-medium text-gray-200">
                        <span>{p.name}</span>
                        <span className="text-emerald-400 font-bold">${p.price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Cód: {p.code}</span>
                        <span>Stock: {p.stock} un.</span>
                      </div>
                      <button
                        onClick={() => setReplyText((prev) => `${prev} ${p.name} ($${p.price.toFixed(2)})`)}
                        className="w-full text-center bg-gray-800 hover:bg-gray-700 text-emerald-400 text-[10px] py-1 rounded border border-gray-700 mt-1"
                      >
                        + Insertar en chat
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="p-4 text-center text-xs text-gray-500">
              Ficha del cliente no disponible.
            </div>
          )}
        </aside>

      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

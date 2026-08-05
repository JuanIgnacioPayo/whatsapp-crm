const { useState, useEffect, useRef } = React;

// CONFIGURACIÓN DE FIREBASE: Reemplaza esto con tus credenciales de la consola de Firebase
// Puedes obtenerlas en: Configuración del proyecto -> Tus aplicaciones -> Agregar aplicación -> Web
const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "PLACEHOLDER_AUTH_DOMAIN",
  projectId: "PLACEHOLDER_PROJECT_ID",
  storageBucket: "PLACEHOLDER_STORAGE_BUCKET",
  messagingSenderId: "PLACEHOLDER_MESSAGING_SENDER_ID",
  appId: "PLACEHOLDER_APP_ID"
};

// Verificar si Firebase ha sido configurado
const isFirebaseConfigured = firebaseConfig.apiKey !== "PLACEHOLDER_API_KEY";

if (typeof firebase !== 'undefined' && isFirebaseConfigured) {
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
}

// Lógica de Registro Inicial en Firestore
const handleUserSetup = async (firebaseUser) => {
  const db = firebase.firestore();
  const userRef = db.collection('users').doc(firebaseUser.uid);
  
  const doc = await userRef.get();
  if (!doc.exists) {
    // Si es el primer usuario, se le asigna rol 'admin' y se le activa automáticamente
    const usersSnap = await db.collection('users').limit(1).get();
    const isFirstUser = usersSnap.empty;
    
    const newUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
      role: isFirstUser ? 'admin' : 'operator',
      active: isFirstUser ? true : false,
      createdAt: new Date().toISOString()
    };
    
    await userRef.set(newUser);
    return newUser;
  } else {
    return doc.data();
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentView, setCurrentView] = useState('crm'); // 'crm' o 'admin'

  // Estados del CRM
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
  
  // Estado de operador y conexión
  const [replyText, setReplyText] = useState('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // URL del Backend Dinámico (desde Firestore)
  const [dynamicApiBase, setDynamicApiBase] = useState(null);
  const [dynamicSocketUrl, setDynamicSocketUrl] = useState(null);

  // Estados para Login / Registro
  const [authTab, setAuthTab] = useState('login'); // 'login' o 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Estado para administración de usuarios
  const [allUsers, setAllUsers] = useState([]);

  const messagesEndRef = useRef(null);

  // 1. Efecto: Listener de Autenticación
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoadingAuth(false);
      return;
    }

    const unsubscribe = firebase.auth().onAuthStateChanged(async (firebaseUser) => {
      setIsLoadingAuth(true);
      if (firebaseUser) {
        try {
          const profile = await handleUserSetup(firebaseUser);
          setUser(firebaseUser);
          setUserProfile(profile);

          // Escuchar cambios del perfil en tiempo real (por si se aprueba o cambia el rol)
          const db = firebase.firestore();
          const profileUnsubscribe = db.collection('users').doc(firebaseUser.uid).onSnapshot((doc) => {
            if (doc.exists) {
              setUserProfile(doc.data());
            }
          });

          setIsLoadingAuth(false);
          return () => profileUnsubscribe();
        } catch (e) {
          console.error("Error cargando perfil del usuario:", e);
          setAuthError("Error al cargar el perfil del usuario de la base de datos.");
          setIsLoadingAuth(false);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setIsLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Efecto: Obtener URL del Backend desde Firestore
  useEffect(() => {
    // Si Firebase no está configurado, usamos localhost por defecto
    if (!isFirebaseConfigured) {
      setDynamicApiBase('http://localhost:3000/api');
      setDynamicSocketUrl('http://localhost:3000');
      return;
    }

    if (!user || !userProfile || !userProfile.active) return;

    // Si estamos corriendo localmente, podemos usar directamente localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setDynamicApiBase('http://localhost:3000/api');
      setDynamicSocketUrl('http://localhost:3000');
      return;
    }

    // Si estamos en hosting de producción, leemos el túnel desde Firestore en tiempo real
    const db = firebase.firestore();
    const docRef = db.collection('config').doc('backend');

    const unsubscribe = docRef.onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data.url) {
          const baseUrl = data.url.replace('/webhook', '');
          setDynamicApiBase(`${baseUrl}/api`);
          setDynamicSocketUrl(baseUrl);
          console.log("🔗 Conectando dinámicamente al backend en:", baseUrl);
        }
      } else {
        console.warn("⚠️ No se encontró la URL del backend activa en Firestore.");
      }
    }, (err) => {
      console.error("Error al obtener la URL del backend:", err);
    });

    return () => unsubscribe();
  }, [user, userProfile]);

  // 3. Efecto: Escuchar listado de usuarios (Sólo para Admins)
  useEffect(() => {
    if (!userProfile || userProfile.role !== 'admin') return;

    const db = firebase.firestore();
    const unsubscribe = db.collection('users').orderBy('createdAt', 'desc').onSnapshot((snap) => {
      const usersList = [];
      snap.forEach(doc => {
        usersList.push(doc.data());
      });
      setAllUsers(usersList);
    }, (err) => console.error("Error al listar usuarios:", err));

    return () => unsubscribe();
  }, [userProfile]);

  // 4. Efecto: Inicializar WebSockets y cargar datos del CRM cuando se define la URL base
  useEffect(() => {
    if (!dynamicApiBase) return;

    fetchMetadata();
    fetchCustomers();
    fetchProducts('');

    // Conectar a Socket.io
    const socket = io(dynamicSocketUrl);

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
  }, [dynamicApiBase]);

  // 5. Efecto: Cargar mensajes de chat seleccionados
  useEffect(() => {
    if (selectedCustomerId && dynamicApiBase) {
      fetchMessages(selectedCustomerId);
    }
  }, [selectedCustomerId, dynamicApiBase]);

  // 6. Scroll automático del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Funciones de llamada al Backend API
  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/customers?state=${stateFilter}&tag=${tagFilter}`);
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
      const res = await fetch(`${dynamicApiBase}/customers/${customerId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async (query) => {
    try {
      const res = await fetch(`${dynamicApiBase}/products?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMetadata = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/metadata`);
      const data = await res.json();
      setMetadata(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || !selectedCustomerId || !dynamicApiBase) return;

    const textToSend = replyText;
    setReplyText('');

    try {
      const currentOpName = userProfile ? userProfile.displayName : 'Sistema';
      await fetch(`${dynamicApiBase}/customers/${selectedCustomerId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSend, operatorName: currentOpName })
      });
      fetchMessages(selectedCustomerId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateState = async (newState, operatorId = null) => {
    if (!selectedCustomerId || !dynamicApiBase) return;
    try {
      await fetch(`${dynamicApiBase}/customers/${selectedCustomerId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState, assignedOperatorId: operatorId })
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetBot = async () => {
    if (!selectedCustomerId || !dynamicApiBase) return;
    try {
      await fetch(`${dynamicApiBase}/customers/${selectedCustomerId}/reset-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTag = async (tagName) => {
    if (!selectedCustomerId || !dynamicApiBase) return;
    try {
      await fetch(`${dynamicApiBase}/customers/${selectedCustomerId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagName })
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulateMessage = async () => {
    if (!dynamicApiBase) return;
    setIsSimulating(true);
    try {
      const randomPhone = `54911${Math.floor(10000000 + Math.random() * 90000000)}`;
      const webhookUrl = `${dynamicSocketUrl}/webhook`;
      await fetch(webhookUrl, {
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

  // Funciones de Autenticación de Firebase
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError("Completa todos los campos.");
      return;
    }
    setAuthError("");
    setAuthLoading(true);
    try {
      await firebase.auth().signInWithEmailAndPassword(authEmail, authPassword);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError("Credenciales incorrectas.");
      } else {
        setAuthError(err.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authDisplayName) {
      setAuthError("Completa todos los campos.");
      return;
    }
    setAuthError("");
    setAuthLoading(true);
    try {
      const cred = await firebase.auth().createUserWithEmailAndPassword(authEmail, authPassword);
      if (cred.user) {
        await cred.user.updateProfile({ displayName: authDisplayName });
        await handleUserSetup(cred.user);
      }
    } catch (err) {
      console.error(err);
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    firebase.auth().signOut();
  };

  // Funciones del Administrador en Firestore
  const handleUpdateUserRole = async (targetUid, newRole) => {
    try {
      const db = firebase.firestore();
      await db.collection('users').doc(targetUid).update({ role: newRole });
    } catch (e) {
      console.error(e);
      alert("Error al actualizar rol de usuario");
    }
  };

  const handleToggleUserActive = async (targetUid, currentActive) => {
    try {
      const db = firebase.firestore();
      await db.collection('users').doc(targetUid).update({ active: !currentActive });
    } catch (e) {
      console.error(e);
      alert("Error al cambiar estado de usuario");
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Filtrado de conversaciones
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.messages[0]?.text || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = stateFilter === 'ALL' || c.conversationState === stateFilter;
    const matchesTag = tagFilter === 'ALL' || c.profileTag === tagFilter || c.tags?.some((t) => t.tag.name === tagFilter);
    return matchesSearch && matchesState && matchesTag;
  });

  // VISTA 1: CARGA DE AUTENTICACIÓN
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-950 text-gray-100">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4"></div>
        <p className="text-sm font-medium text-gray-400">Verificando sesión segura...</p>
      </div>
    );
  }

  // VISTA 2: FIREBASE NO CONFIGURADO
  if (!isFirebaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-950 px-4 text-center">
        <div className="bg-gray-900 border border-amber-600/30 rounded-xl p-8 max-w-lg shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-100">Firebase no está configurado</h2>
            <p className="text-sm text-gray-400">
              Para habilitar el sistema de autenticación, el rol de administrador y el despliegue web, debes configurar tus credenciales de Firebase en <code className="bg-gray-800 text-amber-400 px-1 py-0.5 rounded text-xs">client/app.jsx</code>.
            </p>
          </div>
          <div className="text-left text-xs bg-gray-950 p-4 rounded-lg border border-gray-800 space-y-2">
            <p className="font-semibold text-gray-300">Pasos para activar:</p>
            <ol className="list-decimal pl-4 space-y-1 text-gray-400">
              <li>Crea un proyecto en <a href="https://console.firebase.google.com" target="_blank" className="text-emerald-400 underline">Firebase Console</a></li>
              <li>Añade una aplicación <strong>Web</strong> para obtener tus credenciales</li>
              <li>Copia las llaves y reemplaza el objeto <code className="text-emerald-400">firebaseConfig</code> al inicio de <code className="text-gray-200">client/app.jsx</code></li>
            </ol>
          </div>
          <button
            onClick={() => {
              // Bypass local solo para desarrollo si no tiene Firebase configurado
              setUser({ uid: 'mock', email: 'dev@localhost', displayName: 'Desarrollador Local' });
              setUserProfile({ uid: 'mock', email: 'dev@localhost', displayName: 'Desarrollador Local', role: 'admin', active: true });
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow-lg"
          >
            Modo Demo Local (Omitir Auth)
          </button>
        </div>
      </div>
    );
  }

  // VISTA 3: INICIAR SESIÓN / REGISTRO
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-950 px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 transition ${authTab === 'login' ? 'border-emerald-500 text-emerald-400 bg-gray-900/50' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 transition ${authTab === 'register' ? 'border-emerald-500 text-emerald-400 bg-gray-900/50' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              Registrarse
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-200">CRM WhatsApp Multioperador</h2>
              <p className="text-xs text-gray-400 mt-1">Acceso seguro con Firebase Authentication</p>
            </div>

            {authError && (
              <div className="bg-red-950/60 border border-red-800/40 text-red-300 text-xs px-3.5 py-2.5 rounded-lg">
                ⚠️ {authError}
              </div>
            )}

            <form onSubmit={authTab === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {authTab === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sofía Martínez"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@empresa.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="Min. 6 caracteres"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-xs shadow-lg transition uppercase tracking-wider"
              >
                {authLoading ? 'Procesando...' : authTab === 'login' ? 'Entrar' : 'Crear Cuenta'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // VISTA 4: USUARIO REGISTRADO PERO PENDIENTE DE APROBACIÓN (active === false)
  if (userProfile && !userProfile.active) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-950 px-4 text-center">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-200">Cuenta en Espera de Aprobación</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              Hola <strong>{userProfile.displayName}</strong>, tu cuenta con correo <strong>{userProfile.email}</strong> fue registrada con éxito.
            </p>
            <p className="text-xs text-gray-500">
              Por razones de seguridad, un administrador debe activar tu cuenta antes de que puedas acceder al CRM y chatear por WhatsApp.
            </p>
          </div>
          <div className="border-t border-gray-800 pt-4">
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-red-400 font-medium transition"
            >
              🚪 Cerrar sesión / Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // VISTA 5: USUARIO AUTENTICADO Y ACTIVO
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-gray-100">
      
      {/* 1. TOP NAVBAR */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white shadow-lg">
            WA
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-emerald-400">CRM WhatsApp</h1>
            <p className="text-xs text-gray-400">
              {metadata.whatsappNumber ? `📞 ${metadata.whatsappNumber}` : 'Meta Cloud API Native'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Indicador de conexión de WebSockets */}
          <div className="hidden sm:flex items-center space-x-2 bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-700 text-[10px]">
            <span className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className="text-gray-300">{isSocketConnected ? 'WebSockets' : 'Desconectado'}</span>
          </div>

          {/* Botón de Simulación */}
          <button
            onClick={handleSimulateMessage}
            disabled={isSimulating}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded text-[11px] font-medium transition shadow"
          >
            🧪 {isSimulating ? 'Simulando...' : 'Simular Entrada'}
          </button>

          {/* Menú de Vistas (CRM / Administración si es admin) */}
          {userProfile && userProfile.role === 'admin' && (
            <div className="flex bg-gray-900 rounded p-0.5 border border-gray-700">
              <button
                onClick={() => setCurrentView('crm')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${currentView === 'crm' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Chats
              </button>
              <button
                onClick={() => setCurrentView('admin')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${currentView === 'admin' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                ⚙️ Admin
              </button>
            </div>
          )}

          {/* Perfil del Operador y Botón de Salir */}
          <div className="flex items-center space-x-2 text-xs bg-gray-700 pl-3 pr-1 py-1 rounded-md border border-gray-600">
            <div className="text-left leading-none">
              <p className="font-semibold text-gray-200 max-w-[100px] truncate">{userProfile?.displayName}</p>
              <span className="text-[9px] text-emerald-400 uppercase font-medium">{userProfile?.role}</span>
            </div>
            <button
              onClick={handleSignOut}
              title="Cerrar Sesión"
              className="text-gray-400 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 2. AREA CONTENIDO PRINCIPAL */}
      {currentView === 'admin' && userProfile?.role === 'admin' ? (
        
        /* ================= VISTA ADMIN PANEL ================= */
        <div className="flex-1 p-6 overflow-y-auto bg-gray-900 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-100">Panel de Administración de Usuarios</h2>
                <p className="text-xs text-gray-400">Visualiza, aprueba y modifica los roles de los operadores del CRM</p>
              </div>
              <button
                onClick={() => setCurrentView('crm')}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3.5 py-1.5 rounded border border-gray-700 transition"
              >
                ← Volver a los Chats
              </button>
            </div>

            {/* Listado de Operadores / Usuarios */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-950 text-gray-400 font-semibold border-b border-gray-700">
                    <th className="p-4">Operador</th>
                    <th className="p-4">Correo Electrónico</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Estado de Aprobación</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60">
                  {allUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-700/30 transition">
                      <td className="p-4 flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-white uppercase text-[11px]">
                          {u.displayName ? u.displayName.charAt(0) : 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-200">{u.displayName}</p>
                          <span className="text-[10px] text-gray-500">Reg: {new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">{u.email}</td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          disabled={u.uid === user.uid} // No auto-cambiarse el rol
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                          className="bg-gray-900 text-gray-200 border border-gray-700 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
                        >
                          <option value="operator">Operador (operator)</option>
                          <option value="admin">Administrador (admin)</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${u.active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                          {u.active ? 'Activo (Aprobado)' : 'Pendiente / Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleToggleUserActive(u.uid, u.active)}
                          disabled={u.uid === user.uid} // No auto-desactivarse
                          className={`text-xs px-3 py-1.5 rounded font-semibold transition ${u.active ? 'bg-red-950 text-red-400 border border-red-800 hover:bg-red-900' : 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'}`}
                        >
                          {u.active ? 'Desactivar' : 'Aprobar Acceso'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      ) : (

        /* ================= VISTA PRINCIPAL CRM ================= */
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

                  {/* Acciones del Chat */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleResetBot}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded font-medium shadow"
                    >
                      🤖 Reiniciar Bot
                    </button>

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
                              {isCustomer ? selectedCustomer.name || 'Cliente' : isBot ? '🤖 Bot' : `👤 ${m.operatorName || 'Operador'}`}
                            </span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                          {/* Indicador de estado */}
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

                {/* Caja de Texto */}
                <form onSubmit={handleSendMessage} className="p-3 bg-gray-800 border-t border-gray-700 flex items-center space-x-2 shrink-0">
                  <input
                    type="text"
                    placeholder={`Responder como ${userProfile?.displayName}...`}
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

          {/* PANEL DERECHO: DETALLE DEL CLIENTE */}
          <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
            {selectedCustomer ? (
              <div className="p-4 space-y-5 overflow-y-auto flex-1">
                
                {/* Info Cliente */}
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

                {/* Etiquetas */}
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

                {/* Catálogo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">📦 Catálogo de Precios</h4>
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
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

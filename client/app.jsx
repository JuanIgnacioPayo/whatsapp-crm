const { useState, useEffect, useRef } = React;

// CONFIGURACIÓN DE FIREBASE: Reemplaza esto con tus credenciales de la consola de Firebase
// Puedes obtenerlas en: Configuración del proyecto -> Tus aplicaciones -> Agregar aplicación -> Web
const firebaseConfig = {
  apiKey: "AIzaSyCDu3tJUPJVfPnJTuyPrytb4dqTgSOFuwg",
  authDomain: "crm-whatsapp-11002.firebaseapp.com",
  projectId: "crm-whatsapp-11002",
  storageBucket: "crm-whatsapp-11002.firebasestorage.app",
  messagingSenderId: "73720231709",
  appId: "1:73720231709:web:b18fa0fea38701439ad3f4"
};

// Verificar si Firebase ha sido configurado
const isFirebaseConfigured = firebaseConfig.apiKey !== "PLACEHOLDER_API_KEY";

if (typeof firebase !== 'undefined' && isFirebaseConfigured) {
  if (firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
}

// Configuración del correo del Administrador Principal
const PRIMARY_ADMIN_EMAIL = "elpatiodesalcedo@gmail.com";

// Lógica de Registro Inicial en Firestore con Aprobación Estricta de Administrador
const handleUserSetup = async (firebaseUser) => {
  const userEmail = (firebaseUser.email || '').toLowerCase();
  const isPrimaryAdmin = userEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();

  try {
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(firebaseUser.uid);
    
    let doc;
    try {
      doc = await userRef.get();
    } catch (err) {
      console.warn("Advertencia: No se pudo consultar Firestore:", err.message);
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Usuario'),
        role: isPrimaryAdmin ? 'admin' : 'operator',
        active: isPrimaryAdmin ? true : false,
        createdAt: new Date().toISOString()
      };
    }

    if (doc.exists) {
      const data = doc.data();
      if (isPrimaryAdmin) {
        data.active = true;
        data.role = 'admin';
      }
      return data;
    }

    // El usuario NO existe aún en Firestore.
    const newUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Usuario'),
      role: isPrimaryAdmin ? 'admin' : 'operator',
      active: isPrimaryAdmin ? true : false,
      createdAt: new Date().toISOString()
    };

    try {
      await userRef.set(newUser);
    } catch (writeErr) {
      console.warn("Advertencia: No se pudo guardar el perfil en Firestore:", writeErr.message);
    }

    return newUser;
  } catch (globalErr) {
    console.error("Error en handleUserSetup:", globalErr);
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Usuario'),
      role: isPrimaryAdmin ? 'admin' : 'operator',
      active: isPrimaryAdmin ? true : false
    };
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
  
  // Estados para Código QR y WhatsApp Session
  const [qrCodeData, setQrCodeData] = useState(null);
  const [isQrConnected, setIsQrConnected] = useState(false);
  const [connectedPhone, setConnectedPhone] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(60);
  const [isGlobalBotEnabled, setIsGlobalBotEnabled] = useState(false);
  
  // Estados de Notificaciones Auditivas
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => localStorage.getItem('crm_sound_enabled') !== 'false');
  const [soundVolume, setSoundVolume] = useState(() => Number(localStorage.getItem('crm_sound_volume')) || 80);
  const [soundType, setSoundType] = useState(() => localStorage.getItem('crm_sound_type') || 'chime');
  const [showSoundModal, setShowSoundModal] = useState(false);
  
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

    // Si el servidor Express está sirviendo la aplicación (localhost, Render, Railway, VPS, etc.)
    const origin = window.location.origin;
    if (origin && !origin.includes('firebaseapp.com') && !origin.includes('web.app')) {
      setDynamicApiBase(`${origin}/api`);
      setDynamicSocketUrl(origin);
      return;
    }

    // Si la App está alojada en un hosting estático independiente (ej. Firebase Hosting), leemos el túnel desde Firestore
    try {
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
    } catch (e) {
      console.error("Error al inicializar Firestore para backend dinámico:", e);
    }
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

  // Web Audio API Synthesizer (Notificaciones Sonoras de alta fidelidad)
  const playNotificationSound = (type = soundType, volLevel = soundVolume) => {
    try {
      if (volLevel <= 0) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const gainNode = ctx.createGain();
      const vol = (volLevel / 100) * 0.4;
      gainNode.gain.setValueAtTime(vol, ctx.currentTime);
      gainNode.connect(ctx.destination);

      if (type === 'chime') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.3);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.6);
      } else if (type === 'bell') {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.4);
        osc.connect(gainNode);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === 'pop') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
        osc.connect(gainNode);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 4. Efecto: Inicializar WebSockets y cargar datos del CRM cuando se define la URL base
  useEffect(() => {
    if (!dynamicApiBase) return;

    fetchMetadata();
    fetchCustomers();
    fetchProducts('');
    fetchQrStatus();
    fetchGlobalBotStatus();

    // Conectar a Socket.io
    const socket = io(dynamicSocketUrl, { transports: ['polling', 'websocket'] });

    socket.on('connect', () => setIsSocketConnected(true));
    socket.on('disconnect', () => setIsSocketConnected(false));

    socket.on('qr_code', (data) => {
      setQrCodeData(data.qr);
      setIsQrConnected(data.connected);
      setQrSecondsLeft(data.ttl || 60);
    });

    socket.on('whatsapp_status', (data) => {
      setIsQrConnected(data.connected);
      if (data.connected) {
        setQrCodeData(null);
        setShowQrModal(false);
        if (data.phone) setConnectedPhone(data.phone);
      }
    });

    socket.on('global_bot_updated', (data) => {
      setIsGlobalBotEnabled(data.enabled);
    });

    socket.on('new_message', (newMsg) => {
      if (newMsg.senderType === 'CUSTOMER' && isSoundEnabled) {
        playNotificationSound(soundType, soundVolume);
      }
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

  // 5. Temporizador de cuenta regresiva para la validez del Código QR
  useEffect(() => {
    if (!showQrModal || isQrConnected || !qrCodeData) return;

    const interval = setInterval(() => {
      setQrSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchQrStatus();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showQrModal, isQrConnected, qrCodeData]);

  // 6. Efecto: Cargar mensajes de chat seleccionados
  useEffect(() => {
    if (selectedCustomerId && dynamicApiBase) {
      fetchMessages(selectedCustomerId);
    }
  }, [selectedCustomerId, dynamicApiBase]);

  // 7. Scroll automático del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchQrStatus = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/qr`);
      const data = await res.json();
      setIsQrConnected(data.connected);
      if (data.qr) {
        setQrCodeData(data.qr);
        setQrSecondsLeft(data.ttl || 60);
      }
      if (data.phone) setConnectedPhone(data.phone);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGlobalBotStatus = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/bot/global`);
      const data = await res.json();
      setIsGlobalBotEnabled(data.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleGlobalBot = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/bot/global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !isGlobalBotEnabled })
      });
      const data = await res.json();
      setIsGlobalBotEnabled(data.enabled);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCustomerBot = async (customerId) => {
    if (!customerId || !dynamicApiBase) return;
    try {
      await fetch(`${dynamicApiBase}/customers/${customerId}/toggle-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchCustomers();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/customers?state=${stateFilter}&tag=${tagFilter}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomers(data);
        if (data.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(data[0].id);
        }
      } else {
        setCustomers([]);
      }
    } catch (e) {
      console.error(e);
      setCustomers([]);
    }
  };

  const fetchMessages = async (customerId) => {
    try {
      const res = await fetch(`${dynamicApiBase}/customers/${customerId}/messages`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setMessages([]);
    }
  };

  const fetchProducts = async (query) => {
    try {
      const res = await fetch(`${dynamicApiBase}/products?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProducts([]);
    }
  };

  const fetchMetadata = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/metadata`);
      const data = await res.json();
      if (data && typeof data === 'object' && !data.error) {
        setMetadata(data);
      }
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

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await firebase.auth().signInWithPopup(provider);
      if (cred.user) {
        await handleUserSetup(cred.user);
      }
    } catch (err) {
      console.error("Google Sign-In Error:", err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setAuthError(err.message || "Error al iniciar sesión con Google.");
      }
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

  const handleRejectUser = async (targetUid, userName) => {
    if (!confirm(`¿Estás seguro de rechazar y eliminar la solicitud de "${userName || 'este usuario'}"?`)) return;
    try {
      const db = firebase.firestore();
      await db.collection('users').doc(targetUid).delete();
    } catch (e) {
      console.error(e);
      alert("Error al rechazar usuario: " + e.message);
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

            {/* Separador */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-900 px-3 text-gray-500 font-medium">O continuar con</span>
              </div>
            </div>

            {/* Botón de Iniciar Sesión con Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-3 bg-gray-950 hover:bg-gray-800/80 border border-gray-700/60 hover:border-gray-500 text-gray-200 font-medium py-2.5 px-4 rounded-lg text-xs transition duration-200 shadow-md group disabled:opacity-50"
            >
              <svg className="w-4 h-4 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar con Google</span>
            </button>
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

          {/* Botón de Vinculación WhatsApp QR */}
          <button
            onClick={() => setShowQrModal(true)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition ${isQrConnected ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900' : 'bg-amber-950/80 border-amber-600 text-amber-300 hover:bg-amber-900 animate-pulse'}`}
          >
            <span className={`w-2 h-2 rounded-full ${isQrConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
            <span>{isQrConnected ? `🟢 WhatsApp Vinculado ${connectedPhone ? `(${connectedPhone})` : ''}` : '📱 Escanear QR WhatsApp'}</span>
          </button>

          {/* Botón de Control Global del Bot */}
          <button
            onClick={handleToggleGlobalBot}
            title={isGlobalBotEnabled ? "Apagar el bot para TODOS los chats" : "Encender el bot globalmente para nuevos chats"}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition ${isGlobalBotEnabled ? 'bg-emerald-950/90 border-emerald-600 text-emerald-300 hover:bg-emerald-900' : 'bg-red-950/90 border-red-700 text-red-300 hover:bg-red-900'}`}
          >
            <span>{isGlobalBotEnabled ? '🤖 Bot Global: ON' : '🛑 Bot Global: OFF'}</span>
          </button>

          {/* Botón Configuración de Notificaciones */}
          <button
            onClick={() => setShowSoundModal(true)}
            title="Configurar sonidos y volumen de notificaciones"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-300 text-[11px] font-semibold transition"
          >
            <span>{isSoundEnabled ? `🔔 Sonido (${soundVolume}%)` : '🔕 Silenciado'}</span>
          </button>

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
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition ${currentView === 'admin' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <span>⚙️ Admin</span>
                {allUsers.filter(u => !u.active).length > 0 && (
                  <span className="bg-amber-500 text-gray-950 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold animate-pulse">
                    {allUsers.filter(u => !u.active).length}
                  </span>
                )}
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

            {/* SECCIÓN 1: SOLICITUDES PENDIENTES DE APROBACIÓN */}
            {allUsers.filter(u => !u.active).length > 0 && (
              <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-5 shadow-xl space-y-4">
                <div className="flex items-center space-x-2 text-amber-400">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  <h3 className="font-bold text-sm">
                    🔔 {allUsers.filter(u => !u.active).length} {allUsers.filter(u => !u.active).length === 1 ? 'Solicitud Pendiente de Aprobación' : 'Solicitudes Pendientes de Aprobación'}
                  </h3>
                </div>

                <div className="space-y-2">
                  {allUsers.filter(u => !u.active).map((pendingUser) => (
                    <div key={pendingUser.uid} className="bg-gray-900 border border-gray-800 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center font-bold text-gray-950 text-xs uppercase">
                          {pendingUser.displayName ? pendingUser.displayName.charAt(0) : 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-gray-100">{pendingUser.displayName}</p>
                          <p className="text-[11px] text-gray-400">{pendingUser.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => handleToggleUserActive(pendingUser.uid, false)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded transition shadow flex items-center space-x-1"
                        >
                          <span>✓ Aprobar Acceso</span>
                        </button>
                        <button
                          onClick={() => handleRejectUser(pendingUser.uid, pendingUser.displayName)}
                          className="bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-xs px-3 py-1.5 rounded transition flex items-center space-x-1"
                        >
                          <span>✕ Rechazar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECCIÓN 2: LISTADO GENERAL DE USUARIOS */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg">
              <div className="p-4 bg-gray-950/80 border-b border-gray-700 flex items-center justify-between">
                <h3 className="font-bold text-xs text-gray-200 uppercase tracking-wider">👥 Todos los Usuarios ({allUsers.length})</h3>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-950 text-gray-400 font-semibold border-b border-gray-700">
                    <th className="p-4">Operador</th>
                    <th className="p-4">Correo Electrónico</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Estado</th>
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
                          <span className="text-[10px] text-gray-500">Reg: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/D'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">{u.email}</td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          disabled={u.uid === user.uid}
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                          className="bg-gray-900 text-gray-200 border border-gray-700 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
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
                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => handleToggleUserActive(u.uid, u.active)}
                          disabled={u.uid === user.uid}
                          className={`text-xs px-3 py-1.5 rounded font-semibold transition disabled:opacity-40 ${u.active ? 'bg-amber-950 text-amber-400 border border-amber-800 hover:bg-amber-900' : 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900'}`}
                        >
                          {u.active ? 'Desactivar' : 'Aprobar'}
                        </button>
                        {u.uid !== user.uid && (
                          <button
                            onClick={() => handleRejectUser(u.uid, u.displayName)}
                            className="text-xs px-2.5 py-1.5 rounded font-semibold bg-red-950 text-red-400 border border-red-800 hover:bg-red-900 transition"
                            title="Eliminar usuario"
                          >
                            Eliminar
                          </button>
                        )}
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
                  { id: 'CLOSED', label: '✅ Cerrado' },
                  { id: 'ARCHIVED', label: '📦 Archivados' }
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

                        {/* Badges de Estado, Etiquetas (Minorista/Mayorista/etc.) y Operadores */}
                        <div className="flex items-center space-x-1.5 mt-2 flex-wrap gap-y-1">
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

                          {/* Etiqueta del Bot de Triaje */}
                          {cust.profileTag && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/90 border border-purple-600 text-purple-200 font-bold">
                              🏷️ {cust.profileTag}
                            </span>
                          )}

                          {/* Etiquetas asignadas por Operadores (Minorista, Mayorista, Soporte, etc.) */}
                          {cust.tags && cust.tags.map((t) => {
                            if (cust.profileTag && t.tag.name.toLowerCase() === cust.profileTag.toLowerCase()) return null;
                            return (
                              <span
                                key={t.tag.id || t.tag.name}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-700 text-indigo-200 font-bold"
                              >
                                🏷️ {t.tag.name}
                              </span>
                            );
                          })}

                          {/* Operadores Participantes / Quienes atienden la charla */}
                          {cust.participatingOperators && cust.participatingOperators.length > 0 ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 font-bold flex items-center gap-1 shadow-sm" title={`Atendido por: ${cust.participatingOperators.join(', ')}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              👤 Atiende: {cust.participatingOperators.join(', ')}
                            </span>
                          ) : cust.assignedOperator ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 font-bold flex items-center gap-1 shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              👤 Atiende: {cust.assignedOperator.name}
                            </span>
                          ) : null}
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
                      <div className="flex items-center space-x-2">
                        <h2 className="text-xs font-semibold text-gray-100">{selectedCustomer.name || 'Cliente sin nombre'}</h2>
                        {selectedCustomer.participatingOperators && selectedCustomer.participatingOperators.length > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 font-semibold">
                            👥 Atendido por: {selectedCustomer.participatingOperators.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">{selectedCustomer.phone}</p>
                    </div>
                  </div>

                  {/* Acciones del Chat */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleToggleCustomerBot(selectedCustomer.id)}
                      className={`text-xs px-3 py-1.5 rounded font-medium shadow transition ${selectedCustomer.conversationState === 'BOT_ACTIVE' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                      title={selectedCustomer.conversationState === 'BOT_ACTIVE' ? "Apagar el bot en este chat" : "Activar bot para este chat"}
                    >
                      {selectedCustomer.conversationState === 'BOT_ACTIVE' ? '🛑 Apagar Bot (Este Chat)' : '🤖 Activar Bot (Este Chat)'}
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

                    {selectedCustomer.conversationState === 'ARCHIVED' ? (
                      <button
                        onClick={() => handleUpdateState('PENDING')}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded font-medium shadow"
                        title="Desarchivar esta conversación y volverla a la bandeja de entrada"
                      >
                        📥 Desarchivar Chat
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateState('ARCHIVED')}
                        className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded font-medium transition shadow"
                        title="Archivar conversación y vaciar de la bandeja principal"
                      >
                        📦 Archivar Chat
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
                          <div className="flex items-center justify-between text-[10px] opacity-90 mb-1 space-x-2 border-b border-white/10 pb-1">
                            <span className="font-bold flex items-center gap-1">
                              {isCustomer ? (
                                `💬 ${selectedCustomer.name || 'Cliente'}`
                              ) : isBot ? (
                                '🤖 Bot Automático'
                              ) : (
                                <span className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                  👤 Rep: {m.operatorName || 'Operador'}
                                </span>
                              )}
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

      {/* MODAL VINCULACIÓN CÓDIGO QR WHATSAPP */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-lg font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-100 flex items-center justify-center gap-2">
                <span>📱 Vincular Celular por QR</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Abre WhatsApp en tu teléfono -&gt; Menú / Ajustes -&gt; <strong>Dispositivos vinculados</strong> -&gt; <strong>Vincular un dispositivo</strong>.
              </p>
            </div>

            {isQrConnected ? (
              <div className="bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
                  ✓
                </div>
                <h4 className="font-bold text-sm text-emerald-300">¡WhatsApp Conectado Exitosamente!</h4>
                <p className="text-xs text-gray-300">
                  Tu número {connectedPhone && <strong>+{connectedPhone}</strong>} ya está enlazado. Todos tus operadores pueden chatear libremente.
                </p>
              </div>
            ) : qrCodeData ? (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl inline-block shadow-inner border border-gray-300 relative">
                  <img src={qrCodeData} alt="Código QR WhatsApp" className="w-56 h-56 mx-auto" />
                </div>

                {/* Cuenta Regresiva de Validez del QR */}
                <div className="space-y-2 bg-gray-800/80 p-3 rounded-xl border border-gray-700">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-300 font-medium">⏱️ El Código QR se actualizará en:</span>
                    <span className={`font-bold font-mono text-sm px-2 py-0.5 rounded ${qrSecondsLeft <= 10 ? 'bg-red-950 text-red-400 border border-red-700 animate-pulse' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                      {qrSecondsLeft}s
                    </span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden border border-gray-700">
                    <div
                      className={`h-2 transition-all duration-1000 ${qrSecondsLeft <= 10 ? 'bg-red-500' : 'bg-gradient-to-r from-amber-500 to-emerald-500'}`}
                      style={{ width: `${(qrSecondsLeft / 60) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <p className="text-[11px] text-amber-300 font-medium animate-pulse">
                  ⚡ Escanea la imagen superior con la cámara de WhatsApp de tu celular
                </p>
              </div>
            ) : (
              <div className="p-8 space-y-3">
                <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto"></div>
                <p className="text-xs text-gray-400">Generando Código QR en tiempo real...</p>
              </div>
            )}

            <div className="border-t border-gray-800 pt-4 flex justify-between items-center text-xs text-gray-500">
              <span>CRM Multioperador</span>
              <button
                onClick={fetchQrStatus}
                className="text-emerald-400 hover:underline font-medium"
              >
                🔄 Recargar QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN NOTIFICACIONES DE SONIDO */}
      {showSoundModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-left relative">
            <button
              onClick={() => setShowSoundModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-lg font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <span>🔔 Notificaciones de Sonido</span>
              </h3>
              <p className="text-xs text-gray-400">
                Ajusta las alertas sonoras al recibir nuevos mensajes de clientes.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {/* Interruptor Encendido/Apagado */}
              <div className="flex items-center justify-between bg-gray-800/60 p-3 rounded-xl border border-gray-700">
                <div>
                  <span className="text-xs font-semibold text-gray-200">Alertas de Sonido</span>
                  <p className="text-[10px] text-gray-400">Reproducir tono cuando entra un chat</p>
                </div>
                <button
                  onClick={() => {
                    const next = !isSoundEnabled;
                    setIsSoundEnabled(next);
                    localStorage.setItem('crm_sound_enabled', String(next));
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${isSoundEnabled ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                >
                  {isSoundEnabled ? 'ACTIVADO' : 'APAGADO'}
                </button>
              </div>

              {/* Slider de Volumen */}
              <div className="space-y-1.5 bg-gray-800/60 p-3 rounded-xl border border-gray-700">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-200">Volumen</span>
                  <span className="text-emerald-400 font-bold">{soundVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSoundVolume(val);
                    localStorage.setItem('crm_sound_volume', String(val));
                  }}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Selector de Tono */}
              <div className="space-y-1.5 bg-gray-800/60 p-3 rounded-xl border border-gray-700">
                <span className="text-xs font-semibold text-gray-200">Tono de Notificación</span>
                <select
                  value={soundType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setSoundType(t);
                    localStorage.setItem('crm_sound_type', t);
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="chime">🎵 Chime Suave (Recomendado)</option>
                  <option value="bell">🔔 Campana Cristal</option>
                  <option value="pop">💥 Pop Digital</option>
                </select>
              </div>

              {/* Probar Sonido */}
              <button
                onClick={() => playNotificationSound(soundType, soundVolume)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-xl transition shadow flex items-center justify-center space-x-2"
              >
                <span>🔊 Probar Sonido Actual</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

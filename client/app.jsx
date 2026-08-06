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
      if (isPrimaryAdmin && (!data.active || data.role !== 'admin')) {
        data.active = true;
        data.role = 'admin';
        try {
          // Asegurar que el rol de admin se guarde en la BD si no estaba
          await userRef.update({ active: true, role: 'admin' });
        } catch (updateErr) {
          console.warn("Advertencia: No se pudo actualizar el rol de admin en Firestore", updateErr.message);
        }
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
      if (writeErr.message.includes('permission')) {
        alert("Atención: No tienes permisos para crear tu perfil en la base de datos. Pide al administrador que suba las reglas de Firestore (firebase deploy --only firestore:rules).");
      }
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

function TagsConfigModal({ onClose, dynamicApiBase, availableTags, fetchTags }) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [editingTag, setEditingTag] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    try {
      await fetch(`${dynamicApiBase}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor })
      });
      setNewTagName('');
      setNewTagColor('#3B82F6');
      fetchTags();
    } catch (e) { console.error(e); }
  };

  const handleUpdate = async (tagId) => {
    try {
      await fetch(`${dynamicApiBase}/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, color: editColor })
      });
      setEditingTag(null);
      fetchTags();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (tagId) => {
    if (!confirm('¿Estás seguro de eliminar esta etiqueta? Se quitará de todos los clientes.')) return;
    try {
      await fetch(`${dynamicApiBase}/tags/${tagId}`, { method: 'DELETE' });
      fetchTags();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-waHeader border border-waBorder rounded-lg w-full max-w-2xl shadow-xl flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-waBorder flex justify-between items-center bg-waDark rounded-t-lg">
          <h2 className="text-lg font-bold text-waText flex items-center gap-2">🏷️ Configuración de Etiquetas</h2>
          <button onClick={onClose} className="text-waTextMuted hover:text-waText text-xl">&times;</button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          {/* Formulario Crear */}
          <div className="bg-waDark p-4 rounded-lg border border-waBorder mb-6">
            <h3 className="text-sm font-semibold text-waTextMuted mb-3">Crear Nueva Etiqueta</h3>
            <div className="flex items-center gap-3">
              <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0" />
              <input type="text" placeholder="Nombre de la etiqueta..." value={newTagName} onChange={e => setNewTagName(e.target.value)} className="flex-1 bg-waHeader border border-waBorder rounded p-2 text-waText text-sm focus:outline-none focus:border-waAccent" />
              <button onClick={handleCreate} disabled={!newTagName.trim()} className="bg-waAccent hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-semibold transition">Agregar</button>
            </div>
          </div>

          {/* Lista de Etiquetas */}
          <h3 className="text-sm font-semibold text-waTextMuted mb-3">Etiquetas Existentes</h3>
          {availableTags.length === 0 ? (
            <p className="text-waTextMuted text-sm text-center py-4">No hay etiquetas creadas.</p>
          ) : (
            <div className="space-y-2">
              {availableTags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between bg-waDark border border-waBorder p-3 rounded-lg">
                  {editingTag === tag.id ? (
                    <div className="flex items-center gap-3 flex-1 mr-3">
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" />
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 bg-waHeader border border-waBorder rounded p-1.5 text-waText text-sm focus:outline-none focus:border-waAccent" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: tag.color }}></div>
                      <span className="text-waText text-sm font-medium">{tag.name}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    {editingTag === tag.id ? (
                      <>
                        <button onClick={() => handleUpdate(tag.id)} className="text-emerald-500 hover:text-emerald-400 text-sm font-semibold">Guardar</button>
                        <button onClick={() => setEditingTag(null)} className="text-waTextMuted hover:text-waText text-sm">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingTag(tag.id); setEditName(tag.name); setEditColor(tag.color); }} className="text-waTextMuted hover:text-blue-400 text-sm transition">✏️ Editar</button>
                        <button onClick={() => handleDelete(tag.id)} className="text-waTextMuted hover:text-red-400 text-sm transition ml-2">🗑️ Eliminar</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickRepliesConfigModal({ onClose, dynamicApiBase, quickReplies, fetchQuickReplies }) {
  const [newShortcut, setNewShortcut] = useState('');
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editShortcut, setEditShortcut] = useState('');
  const [editText, setEditText] = useState('');

  const handleCreate = async () => {
    if (!newShortcut.trim() || !newText.trim()) return;
    try {
      const res = await fetch(`${dynamicApiBase}/quick-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut: newShortcut.trim(), text: newText.trim() })
      });
      if (!res.ok) throw new Error('Error al crear');
      setNewShortcut('');
      setNewText('');
      fetchQuickReplies();
    } catch (e) {
      alert('Error al crear respuesta rápida. Tal vez el atajo ya existe.');
    }
  };

  const handleUpdate = async (id) => {
    try {
      const res = await fetch(`${dynamicApiBase}/quick-replies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortcut: editShortcut.trim(), text: editText.trim() })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      setEditingId(null);
      fetchQuickReplies();
    } catch (e) {
      alert('Error al actualizar.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar esta respuesta rápida?')) return;
    try {
      await fetch(`${dynamicApiBase}/quick-replies/${id}`, { method: 'DELETE' });
      fetchQuickReplies();
    } catch (e) {
      alert('Error al eliminar.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm">
      <div className="bg-waDark border border-waBorder rounded-lg w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 bg-waHeader border-b border-waBorder flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-waText font-semibold text-lg flex items-center gap-2">
              ⚡ Respuestas Rápidas
            </h2>
            <p className="text-xs text-waTextMuted mt-1">Usa variables como {'{{nombre}}'} para que se reemplacen automáticamente en el chat.</p>
          </div>
          <button onClick={onClose} className="text-waTextMuted hover:text-waText bg-waDark p-1.5 rounded-md">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>
          </button>
        </div>

        {/* Creador */}
        <div className="p-4 bg-waHeader/50 border-b border-waBorder shrink-0">
          <h3 className="text-sm font-semibold text-waTextMuted mb-3">Crear Nuevo Atajo</h3>
          <div className="flex gap-3 items-start">
            <div className="flex-1 space-y-2">
              <input 
                type="text" 
                placeholder="Atajo (ej: hola)" 
                value={newShortcut}
                onChange={e => setNewShortcut(e.target.value)}
                className="w-full bg-waDark border border-waBorder text-waText rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
              <textarea 
                placeholder="Texto del mensaje (ej: ¡Hola {{nombre}}! ¿En qué te ayudo?)" 
                value={newText}
                onChange={e => setNewText(e.target.value)}
                rows="2"
                className="w-full bg-waDark border border-waBorder text-waText rounded px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
            </div>
            <button 
              onClick={handleCreate}
              disabled={!newShortcut.trim() || !newText.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded transition shadow-sm h-10 shrink-0"
            >
              Añadir
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="p-4 overflow-y-auto flex-1 bg-waDark">
          {quickReplies.length === 0 ? (
            <div className="text-center text-waTextMuted text-sm py-8 bg-waHeader rounded-lg border border-waBorder border-dashed">
              No tienes respuestas rápidas creadas.
            </div>
          ) : (
            <div className="space-y-3">
              {quickReplies.map(reply => (
                <div key={reply.id} className="bg-waHeader p-3 rounded-lg border border-waBorder shadow-sm flex flex-col gap-2">
                  {editingId === reply.id ? (
                    <div className="flex gap-3 items-start">
                      <div className="flex-1 space-y-2">
                        <input 
                          type="text" 
                          value={editShortcut}
                          onChange={e => setEditShortcut(e.target.value)}
                          className="w-full bg-waDark border border-waBorder text-waText rounded px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <textarea 
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          rows="2"
                          className="w-full bg-waDark border border-waBorder text-waText rounded px-2 py-1.5 text-sm outline-none focus:border-emerald-500 resize-none"
                        />
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button onClick={() => handleUpdate(reply.id)} className="text-emerald-500 hover:text-emerald-400 text-sm font-semibold bg-waDark px-3 py-1.5 rounded">Guardar</button>
                        <button onClick={() => setEditingId(null)} className="text-waTextMuted hover:text-waText text-sm bg-waDark px-3 py-1.5 rounded">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-bold text-emerald-400 text-sm mb-1 bg-waDark inline-block px-2 py-0.5 rounded-md border border-waBorder">{reply.shortcut}</div>
                        <div className="text-sm text-waText whitespace-pre-wrap mt-1 opacity-90">{reply.text}</div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button onClick={() => { setEditingId(reply.id); setEditShortcut(reply.shortcut); setEditText(reply.text); }} className="text-waTextMuted hover:text-blue-400 text-sm transition bg-waDark px-3 py-1.5 rounded">✏️ Editar</button>
                        <button onClick={() => handleDelete(reply.id)} className="text-waTextMuted hover:text-red-400 text-sm transition bg-waDark px-3 py-1.5 rounded">🗑️ Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [currentView, setCurrentView] = useState('crm'); // 'crm' o 'admin'

  // Estados del CRM
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [products, setProducts] = useState([]);
  const [metadata, setMetadata] = useState({ operators: [], tags: [] });
  
  // Filtros
  const [stateFilter, setStateFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearch, setProductSearch] = useState('');
  
  // Estado de operador y conexión
  const [replyText, setReplyText] = useState('');

  // Quick Replies Autocomplete
  const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);
  const [filteredQuickReplies, setFilteredQuickReplies] = useState([]);
  const [quickReplySelectedIndex, setQuickReplySelectedIndex] = useState(0);

  useEffect(() => {
    if (replyText.startsWith('/')) {
      const query = replyText.toLowerCase();
      const matches = quickReplies.filter(qr => qr.shortcut.toLowerCase().startsWith(query));
      setFilteredQuickReplies(matches);
      setShowQuickReplyMenu(matches.length > 0);
      setQuickReplySelectedIndex(0);
    } else {
      setShowQuickReplyMenu(false);
    }
  }, [replyText, quickReplies]);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Settings
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const [systemSettings, setSystemSettings] = useState({ ignore_groups: 'true', ignore_status: 'true', theme: 'dark' });

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      setSystemSettings(prev => ({ ...prev, ...data }));
      if (data.theme === 'light') {
        document.body.classList.remove('bg-gray-900', 'text-gray-100');
        document.body.classList.add('bg-white', 'text-gray-900');
        document.documentElement.classList.add('light-theme');
      }
    }).catch(e => console.error('Error load settings', e));
  }, []);
  
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
  const [isSending, setIsSending] = useState(false);
  const [showSoundModal, setShowSoundModal] = useState(false);
  
  // URL del Backend Dinámico (desde Firestore)
  const [dynamicApiBase, setDynamicApiBase] = useState(null);
  const [dynamicSocketUrl, setDynamicSocketUrl] = useState(null);
  // Etiquetas dinámicas
  const [availableTags, setAvailableTags] = useState([]);
  const [showTagsModal, setShowTagsModal] = useState(false);

  // Respuestas Rápidas
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickRepliesModal, setShowQuickRepliesModal] = useState(false);

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
  const chatInputRef = useRef(null);

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
  const [pendingUsersAlert, setPendingUsersAlert] = useState(false);
  const prevPendingCountRef = useRef(0);

  useEffect(() => {
    if (!userProfile || userProfile.role !== 'admin') return;

    try {
      const db = firebase.firestore();
      const unsubscribe = db.collection('users').orderBy('createdAt', 'desc').onSnapshot((snap) => {
        const usersList = [];
        snap.forEach(doc => {
          usersList.push(doc.data());
        });
        setAllUsers(usersList);

        // Detectar nuevos usuarios pendientes de aprobación
        const pendingCount = usersList.filter(u => !u.active).length;
        if (pendingCount > prevPendingCountRef.current && prevPendingCountRef.current >= 0) {
          setPendingUsersAlert(true);
          if (isSoundEnabled) {
            playNotificationSound('bell', soundVolume);
          }
        }
        prevPendingCountRef.current = pendingCount;
      }, (err) => {
        console.error("Error al listar usuarios:", err);
        if (err.message.includes('permission')) {
          alert('Error de permisos en Firestore. Asegúrate de haber subido las reglas de seguridad ejecutando "firebase deploy --only firestore:rules" en tu terminal.');
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Error al escuchar usuarios en Firestore:", e);
    }
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
    fetchTags();
    fetchQuickReplies();
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
        // Cargar chats al conectar WhatsApp
        setIsLoadingChats(true);
        fetchCustomers().finally(() => setIsLoadingChats(false));
      }
    });

    socket.on('global_bot_updated', (data) => {
      setIsGlobalBotEnabled(data.enabled);
    });

    socket.on('tags_updated', () => {
      fetchTags();
      fetchCustomers(); // Actualizar la vista de clientes para reflejar cambios en etiquetas
    });

    socket.on('new_message', (newMsg) => {
      if (newMsg.senderType === 'CUSTOMER' && isSoundEnabled) {
        playNotificationSound(soundType, soundVolume);
      }
      setMessages((prev) => {
        if (prev.length > 0 && prev[0].customerId === newMsg.customerId) {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        }
        return prev;
      });
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
      setMessages((prev) => {
        if (prev.length > 0 && prev[0].customerId === data.customerId) {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        }
        return prev;
      });
      fetchCustomers();
    });

    return () => socket.disconnect();
  }, [dynamicApiBase]);

  // 5. Temporizador de cuenta regresiva para la validez del Código QR
  useEffect(() => {
    const shouldPoll = showQrModal || authTab === 'qr';
    if (!shouldPoll || isQrConnected || !qrCodeData) return;

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
  }, [showQrModal, authTab, isQrConnected, qrCodeData]);

  // Efecto: Cargar QR inicial al abrir pestaña de vinculación sin login
  useEffect(() => {
    if (authTab === 'qr') {
      fetchQrStatus();
    }
  }, [authTab]);

  // 6. Efecto: Cargar mensajes de chat seleccionados
  useEffect(() => {
    if (selectedCustomerId && dynamicApiBase) {
      fetchMessages(selectedCustomerId);
    }
  }, [selectedCustomerId, dynamicApiBase]);

  // 7. Scroll y Focus automático del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  useEffect(() => {
    if (selectedCustomerId) {
      chatInputRef.current?.focus();
    }
  }, [selectedCustomerId]);

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

  const fetchTags = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/tags`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAvailableTags(data);
      }
    } catch (e) {
      console.error('Error fetching tags:', e);
    }
  };

  const fetchQuickReplies = async () => {
    try {
      const res = await fetch(`${dynamicApiBase}/quick-replies`);
      const data = await res.json();
      setQuickReplies(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error fetching quick replies:', e);
    }
  };

  const fetchCustomers = async () => {
    const wasEmpty = customers.length === 0;
    if (wasEmpty) setIsLoadingChats(true);
    try {
      const res = await fetch(`${dynamicApiBase}/customers?state=${stateFilter}&tag=${tagFilter}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCustomers(data);
      } else {
        setCustomers([]);
      }
    } catch (e) {
      console.error(e);
      setCustomers([]);
    } finally {
      if (wasEmpty) setIsLoadingChats(false);
    }
  };

  const fetchMessages = async (customerId) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`${dynamicApiBase}/customers/${customerId}/messages`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
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
    if (!replyText.trim() || !selectedCustomerId || !dynamicApiBase || isSending) return;

    const textToSend = replyText;
    setIsSending(true);
    setReplyText('');
    setShowQuickReplyMenu(false);

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
    } finally {
      setIsSending(false);
    }
  };

  const applyQuickReply = (reply) => {
    let replacedText = reply.text;
    if (selectedCustomer?.name) {
      replacedText = replacedText.replace(/\{\{nombre\}\}/gi, selectedCustomer.name);
    } else {
      replacedText = replacedText.replace(/\{\{nombre\}\}/gi, '');
    }
    setReplyText(replacedText);
    setShowQuickReplyMenu(false);
    chatInputRef.current?.focus();
  };

  const handleQuickReplyKeyDown = (e) => {
    if (!showQuickReplyMenu || filteredQuickReplies.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setQuickReplySelectedIndex((prev) => (prev + 1) % filteredQuickReplies.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setQuickReplySelectedIndex((prev) => (prev - 1 + filteredQuickReplies.length) % filteredQuickReplies.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      applyQuickReply(filteredQuickReplies[quickReplySelectedIndex]);
    } else if (e.key === 'Escape') {
      setShowQuickReplyMenu(false);
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
      if (cred.user && authDisplayName) {
        await cred.user.updateProfile({ displayName: authDisplayName });
        // NOTA: No llamamos a handleUserSetup aquí porque onAuthStateChanged ya lo hace automáticamente.
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
      await firebase.auth().signInWithPopup(provider);
      // NOTA: onAuthStateChanged manejará el setup.
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
    // Limpiar todo el estado del CRM antes de cerrar sesión
    setCustomers([]);
    setMessages([]);
    setSelectedCustomerId(null);
    setProducts([]);
    setMetadata({ operators: [], tags: [] });
    setReplyText('');
    setSearchQuery('');
    setStateFilter('ALL');
    setTagFilter('ALL');
    setCurrentView('crm');
    setQrCodeData(null);
    setIsQrConnected(false);
    setConnectedPhone(null);
    setShowQrModal(false);
    setAllUsers([]);
    setShowSettingsMenu(false);
    setShowSoundModal(false);
    // Finalmente cerrar sesión de Firebase
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

  const handleDisconnectWhatsApp = async () => {
    if (!confirm("⚠️ ¿Estás seguro de que deseas desconectar la línea de WhatsApp actual? Esto borrará la sesión de conexión actual.")) return;
    const wipeChats = confirm("🚨 ¿Deseas también ELIMINAR todo el historial de chats de la base de datos? (Ideal si vas a conectar un número nuevo).");
    try {
      await fetch(dynamicApiBase ? `${dynamicApiBase}/qr/disconnect` : '/api/qr/disconnect', { method: 'POST' });
      if (wipeChats) {
        await fetch(dynamicApiBase ? `${dynamicApiBase}/customers` : '/api/customers', { method: 'DELETE' });
      }
      // Limpiar estado del CRM
      setCustomers([]);
      setMessages([]);
      setSelectedCustomerId(null);
      setQrCodeData(null);
      setIsQrConnected(false);
      setConnectedPhone(null);
      setShowSettingsMenu(false);
      setShowQrModal(true);
    } catch (e) {
      console.error(e);
      alert("Error al intentar desconectar WhatsApp.");
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

  // Filtrado de conversaciones y ordenamiento por fecha de último mensaje
  const filteredCustomers = customers.filter((c) => {
    if (systemSettings.ignore_status === 'true' && (c.phone.includes('@newsletter') || c.phone.includes('status@broadcast') || c.phone.includes('@broadcast'))) return false;
    if (systemSettings.ignore_groups === 'true' && c.phone.includes('@g.us')) return false;

    const matchesSearch =
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.messages[0]?.text || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = stateFilter === 'ALL' || c.conversationState === stateFilter;
    const matchesTag = tagFilter === 'ALL' || c.profileTag === tagFilter || c.tags?.some((t) => t.tag.name === tagFilter);
    return matchesSearch && matchesState && matchesTag;
  }).sort((a, b) => {
    const dateA = a.messages && a.messages[0] ? new Date(a.messages[0].createdAt).getTime() : new Date(a.createdAt || 0).getTime();
    const dateB = b.messages && b.messages[0] ? new Date(b.messages[0].createdAt).getTime() : new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  // VISTA 1: CARGA DE AUTENTICACIÓN
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-waChatBg bg-wa-doodle text-gray-100">
        <div className="relative z-10 w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin mb-4"></div>
        <p className="relative z-10 text-sm font-medium text-waTextMuted">Verificando sesión segura...</p>
      </div>
    );
  }

  // VISTA 2: FIREBASE NO CONFIGURADO
  if (!isFirebaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-waChatBg bg-wa-doodle px-4 text-center">
        <div className="relative z-10 bg-gray-900 border border-amber-600/30 rounded-xl p-8 max-w-lg shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-100">Firebase no está configurado</h2>
            <p className="text-sm text-waTextMuted">
              Para habilitar el sistema de autenticación, el rol de administrador y el despliegue web, debes configurar tus credenciales de Firebase en <code className="bg-waHeader text-amber-400 px-1 py-0.5 rounded text-xs">client/app.jsx</code>.
            </p>
          </div>
          <div className="text-left text-xs bg-waChatBg bg-wa-doodle p-4 rounded-lg border border-gray-800 space-y-2">
            <p className="font-semibold text-gray-300">Pasos para activar:</p>
            <ol className="list-decimal pl-4 space-y-1 text-waTextMuted">
              <li>Crea un proyecto en <a href="https://console.firebase.google.com" target="_blank" className="text-emerald-400 underline">Firebase Console</a></li>
              <li>Añade una aplicación <strong>Web</strong> para obtener tus credenciales</li>
              <li>Copia las llaves y reemplaza el objeto <code className="text-emerald-400">firebaseConfig</code> al inicio de <code className="text-waText">client/app.jsx</code></li>
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
      <div className="flex items-center justify-center h-screen w-screen bg-waChatBg bg-wa-doodle px-4">
        <div className="bg-waDark border border-waBorder rounded-xl w-full max-w-md shadow-2xl overflow-hidden relative z-10">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 transition ${authTab === 'login' ? 'border-emerald-500 text-emerald-400 bg-gray-900/50' : 'border-transparent text-waTextMuted hover:text-waText'}`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 transition ${authTab === 'register' ? 'border-emerald-500 text-emerald-400 bg-gray-900/50' : 'border-transparent text-waTextMuted hover:text-waText'}`}
            >
              Registrarse
            </button>
            <button
              onClick={() => { setAuthTab('qr'); setAuthError(''); }}
              className={`flex-1 py-4 text-sm font-semibold border-b-2 transition ${authTab === 'qr' ? 'border-emerald-500 text-emerald-400 bg-gray-900/50' : 'border-transparent text-waTextMuted hover:text-waText'}`}
            >
              Vincular WhatsApp
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-bold text-waText">CRM WhatsApp Multioperador</h2>
              <p className="text-xs text-waTextMuted mt-1">{authTab === 'qr' ? 'Vincular línea de WhatsApp' : 'Acceso seguro con Firebase Authentication'}</p>
            </div>

            {authTab === 'qr' ? (
              <div className="flex flex-col items-center justify-center space-y-6">
                {isQrConnected ? (
                  <div className="bg-emerald-900/40 border border-emerald-500/50 rounded-xl p-6 text-center space-y-4">
                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                    </div>
                    <h3 className="text-lg font-bold text-emerald-400">¡Conexión Exitosa!</h3>
                    <p className="text-sm text-emerald-100">
                      Hola, la sesión de WhatsApp se ha iniciado correctamente y has finalizado tu tarea.
                    </p>
                    <button
                      onClick={() => setAuthTab('login')}
                      className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition shadow-lg"
                    >
                      Volver al Login
                    </button>
                  </div>
                ) : qrCodeData ? (
                  <div className="space-y-4 text-center w-full">
                    <div className="bg-white p-4 rounded-xl inline-block shadow-inner border border-gray-300 relative mx-auto">
                      <img src={qrCodeData} alt="Código QR WhatsApp" className="w-56 h-56" />
                    </div>
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
                      <p className="text-sm text-waTextMuted mb-2">Escanea el código QR desde la aplicación de WhatsApp en tu celular.</p>
                      <p className="text-xs font-mono text-emerald-500">Expira en {qrSecondsLeft}s</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 space-y-4 text-center">
                    <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin mx-auto"></div>
                    <p className="text-sm text-waTextMuted">Generando código QR...</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {authError && (
                  <div className="bg-red-950/60 border border-red-800/40 text-red-300 text-xs px-3.5 py-2.5 rounded-lg">
                    ⚠️ {authError}
                  </div>
                )}

            <form onSubmit={authTab === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {authTab === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-waTextMuted mb-1.5 uppercase">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sofía Martínez"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    className="w-full bg-waChatBg bg-wa-doodle border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-waTextMuted mb-1.5 uppercase">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@empresa.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-waChatBg bg-wa-doodle border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-waTextMuted mb-1.5 uppercase">Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="Min. 6 caracteres"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-waChatBg bg-wa-doodle border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
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
              className="w-full flex items-center justify-center gap-3 bg-waChatBg bg-wa-doodle hover:bg-waHeader/80 border border-gray-700/60 hover:border-gray-500 text-waText font-medium py-2.5 px-4 rounded-lg text-xs transition duration-200 shadow-md group disabled:opacity-50"
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
          </>
            )}
        </div>
      </div>
    );
  }

  // VISTA 4: USUARIO REGISTRADO PERO PENDIENTE DE APROBACIÓN (active === false)
  if (userProfile && !userProfile.active) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-waChatBg bg-wa-doodle px-4 text-center">
        <div className="bg-waDark border border-waBorder rounded-xl p-8 max-w-md shadow-2xl space-y-6 relative z-10">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-waText">Cuenta en Espera de Aprobación</h2>
            <p className="text-xs text-waTextMuted leading-relaxed">
              Hola <strong>{userProfile.displayName}</strong>, tu cuenta con correo <strong>{userProfile.email}</strong> fue registrada con éxito.
            </p>
            <p className="text-xs text-gray-500">
              Por razones de seguridad, un administrador debe activar tu cuenta antes de que puedas acceder al CRM y chatear por WhatsApp.
            </p>
          </div>
          <div className="border-t border-gray-800 pt-4">
            <button
              onClick={handleSignOut}
              className="text-xs text-waTextMuted hover:text-red-400 font-medium transition"
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
    <div className="flex flex-col h-screen w-screen bg-waDark text-waText">
      
      {/* BANNER DE ALERTA: Usuarios Pendientes de Aprobación */}
      {userProfile?.role === 'admin' && allUsers.filter(u => !u.active).length > 0 && (
        <div className="bg-amber-900/90 border-b border-amber-700 px-4 py-2.5 flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <span className="text-lg">🔔</span>
            <div>
              <span className="text-xs font-bold text-amber-200">
                {allUsers.filter(u => !u.active).length} usuario(s) esperando aprobación
              </span>
              <span className="text-[10px] text-amber-300/80 ml-2">
                ({allUsers.filter(u => !u.active).map(u => u.displayName || u.email).join(', ')})
              </span>
            </div>
          </div>
          <button
            onClick={() => { setCurrentView('admin'); setPendingUsersAlert(false); }}
            className="bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold px-4 py-1.5 rounded-lg transition shadow"
          >
            👥 Revisar Solicitudes
          </button>
        </div>
      )}

      {/* 2. AREA CONTENIDO PRINCIPAL */}
      {currentView === 'admin' && userProfile?.role === 'admin' ? (
        
        /* ================= VISTA ADMIN PANEL ================= */
        <div className="flex-1 p-6 overflow-y-auto bg-gray-900 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-6">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-100">Panel de Administración de Usuarios</h2>
                <p className="text-xs text-waTextMuted">Visualiza, aprueba y modifica los roles de los operadores del CRM</p>
              </div>
              <button
                onClick={() => setCurrentView('crm')}
                className="bg-waHeader hover:bg-gray-700 text-gray-300 text-xs px-3.5 py-1.5 rounded border border-gray-700 transition"
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
                          <p className="text-[11px] text-waTextMuted">{pendingUser.email}</p>
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
            <div className="bg-waHeader rounded-xl border border-gray-700 overflow-hidden shadow-lg">
              <div className="p-4 bg-waChatBg bg-wa-doodle/80 border-b border-waBorder flex items-center justify-between">
                <h3 className="font-bold text-xs text-waText uppercase tracking-wider">👥 Todos los Usuarios ({allUsers.length})</h3>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-waChatBg bg-wa-doodle text-waTextMuted font-semibold border-b border-waBorder">
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
                          <p className="font-semibold text-waText">{u.displayName}</p>
                          <span className="text-[10px] text-gray-500">Reg: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/D'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">{u.email}</td>
                      <td className="p-4">
                        <select
                          value={u.role}
                          disabled={u.uid === user.uid}
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                          className="bg-gray-900 text-waText border border-gray-700 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
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
          <aside className="w-80 bg-waDark border-r border-waBorder flex flex-col shrink-0">
            {/* CABECERA ESTILO WHATSAPP (Panel Izquierdo) */}
            <header className="h-16 bg-waHeader flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-waBorder flex items-center justify-center font-bold text-waText uppercase">
                  {userProfile?.displayName ? userProfile.displayName.charAt(0) : 'U'}
                </div>
              </div>
              <div className="flex items-center gap-4 text-waTextMuted">
                <button 
                  onClick={() => {
                    const newVal = systemSettings.ignore_groups === 'true' ? 'false' : 'true';
                    setSystemSettings(prev => ({...prev, ignore_groups: newVal}));
                    fetch(dynamicApiBase ? `${dynamicApiBase}/api/settings` : '/api/settings', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({...systemSettings, ignore_groups: newVal})
                    }).catch(console.error);
                  }}
                  title={systemSettings.ignore_groups === 'true' ? 'Mostrar Grupos' : 'Ocultar Grupos'} 
                  className={systemSettings.ignore_groups === 'true' ? 'text-red-400 opacity-60 hover:opacity-100 transition' : 'text-emerald-500 hover:opacity-80 transition'}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"></path></svg>
                </button>
                <button 
                  onClick={() => {
                    const newVal = systemSettings.ignore_status === 'true' ? 'false' : 'true';
                    setSystemSettings(prev => ({...prev, ignore_status: newVal}));
                    fetch(dynamicApiBase ? `${dynamicApiBase}/api/settings` : '/api/settings', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({...systemSettings, ignore_status: newVal})
                    }).catch(console.error);
                  }}
                  title={systemSettings.ignore_status === 'true' ? 'Mostrar Canales/Estados' : 'Ocultar Canales/Estados'} 
                  className={systemSettings.ignore_status === 'true' ? 'text-red-400 opacity-60 hover:opacity-100 transition' : 'text-emerald-500 hover:opacity-80 transition'}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"></path></svg>
                </button>
                
                {isQrConnected ? (
                  <button title="WhatsApp Vinculado" className="text-emerald-500"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg></button>
                ) : (
                  <button onClick={() => setShowQrModal(true)} title="Vincular WhatsApp" className="text-amber-500 animate-pulse"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 16H7V5h10v14z"></path></svg></button>
                )}
                <div className="relative">
                  <button title="Menú" onClick={() => setShowSettingsMenu(!showSettingsMenu)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"></path></svg>
                  </button>
                  {showSettingsMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-waHeader border border-waBorder rounded-lg shadow-xl py-2 z-50 text-sm">
                      {userProfile?.role === 'admin' && (
                        <button 
                          onClick={() => { setShowSettingsMenu(false); setCurrentView(currentView === 'admin' ? 'crm' : 'admin'); }}
                          className="w-full text-left px-4 py-2 hover:bg-waDark text-waText transition"
                        >
                          🛡️ {currentView === 'admin' ? 'Volver al CRM' : 'Usuarios'}
                        </button>
                      )}
                      <button 
                        onClick={() => { setShowSettingsMenu(false); setShowTagsModal(true); }}
                        className="w-full text-left px-4 py-2 hover:bg-waDark text-waText transition"
                      >
                        🏷️ Etiquetas
                      </button>
                      <button 
                        onClick={() => { setShowSettingsMenu(false); setShowQuickRepliesModal(true); }}
                        className="w-full text-left px-4 py-2 hover:bg-waDark text-waText transition"
                      >
                        ⚡ Respuestas Rápidas
                      </button>
                      <button 
                        onClick={() => {
                          const newTheme = systemSettings.theme === 'dark' ? 'light' : 'dark';
                          setSystemSettings(prev => ({...prev, theme: newTheme}));
                          fetch(dynamicApiBase ? `${dynamicApiBase}/api/settings` : '/api/settings', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({...systemSettings, theme: newTheme})
                          }).catch(console.error);
                          localStorage.setItem('crm_theme', newTheme);
                          if (newTheme === 'light') {
                            document.documentElement.classList.add('light-theme');
                          } else {
                            document.documentElement.classList.remove('light-theme');
                          }
                          setShowSettingsMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-waDark text-waText transition"
                      >
                        {systemSettings.theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
                      </button>
                      
                      {userProfile?.role === 'admin' && (
                        <>
                          <div className="border-t border-gray-700/50 my-1"></div>
                          <button 
                            onClick={handleDisconnectWhatsApp}
                            className="w-full text-left px-4 py-2 hover:bg-red-900/40 text-red-400 transition flex items-center gap-2"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                            {isQrConnected ? 'Desconectar WhatsApp' : 'Limpiar Chats (Desconectado)'}
                          </button>
                        </>
                      )}
                      
                      <div className="border-t border-gray-700/50 my-1"></div>
                      <button 
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2 hover:bg-waDark text-waText transition flex items-center gap-2"
                      >
                        🚪 Cerrar Sesión del CRM
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Filtros por Estado */}
            <div className="p-3 border-b border-waBorder space-y-2">
              <div className="grid grid-cols-2 gap-1 text-[11px] font-medium">
                {[
                  { id: 'ALL', label: 'Todos' },
                  { id: 'BOT_ACTIVE', label: '🤖 Bot' },
                  { id: 'PENDING', label: '⏳ Pendiente' },
                  { id: 'IN_ATTENTION', label: '💬 En Atención' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setStateFilter(f.id)}
                    className={`py-1.5 px-2 rounded-md transition text-center truncate ${
                      stateFilter === f.id ? 'bg-waBorder text-waText font-semibold' : 'bg-waHeader text-waTextMuted hover:bg-waBorder'
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
                className="w-full bg-waDark border border-waBorder rounded-md px-3 py-1.5 text-xs text-waText focus:outline-none focus:border-waAccent"
              />
            </div>

            {/* Lista de Conversaciones */}
            <div className="flex-1 overflow-y-auto divide-y divide-waBorder">
              {isLoadingChats ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-waAccent/20 rounded-full"></div>
                    <div className="w-12 h-12 border-4 border-waAccent border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold text-waText">Sincronizando chats...</p>
                    <p className="text-[11px] text-waTextMuted">Cargando conversaciones de WhatsApp</p>
                  </div>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-waAccent rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-2 h-2 bg-waAccent rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-2 h-2 bg-waAccent rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-6 text-center text-xs text-waTextMuted">
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
                        isSelected ? 'bg-waBorder border-l-4 border-waAccent' : 'hover:bg-waHeader'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-waHeader flex items-center justify-center font-bold text-waText shrink-0 overflow-hidden">
                        {cust.profilePictureUrl ? <img src={cust.profilePictureUrl} className="w-full h-full object-cover" alt="Avatar" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} /> : null}
                        <div style={{ display: cust.profilePictureUrl ? 'none' : 'flex' }} className="w-full h-full items-center justify-center bg-waHeader font-bold text-waText">
                          {cust.name ? cust.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold truncate text-waText">{cust.name && cust.name !== cust.phone && !cust.name.startsWith('Cliente ') ? cust.name : `+${cust.phone}`}</h3>
                          <span className="text-[10px] text-waTextMuted">
                            {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        <p className="text-xs text-waTextMuted truncate mt-0.5">
                          {lastMsg ? lastMsg.text : 'Sin mensajes'}
                        </p>

                        {/* Badges de Estado, Etiquetas (Minorista/Mayorista/etc.) y Operadores */}
                        <div className="flex items-center space-x-1.5 mt-2 flex-wrap gap-y-1">
                          {cust.conversationState === 'BOT_ACTIVE' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold bg-blue-900/80 text-blue-300">
                              BOT_ACTIVE
                            </span>
                          )}

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
                                style={{ backgroundColor: t.tag.color ? `${t.tag.color}CC` : '#3730a3', borderColor: t.tag.color || '#4338ca', color: '#fff' }}
                                className="text-[9px] px-1.5 py-0.5 rounded border font-bold text-white shadow-sm"
                              >
                                🏷️ {t.tag.name}
                              </span>
                            );
                          })}

                          {/* Operadores Participantes / Quienes atienden la charla */}
                          {cust.participatingOperators && cust.participatingOperators.length > 0 ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 font-bold flex items-center gap-1 shadow-sm" title={`Atendido por: ${cust.participatingOperators.join(', ')}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              {cust.participatingOperators.join(', ').includes('WhatsApp Celular') ? '📱' : '💻'} {cust.participatingOperators.join(', ')}
                            </span>
                          ) : cust.assignedOperator ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 font-bold flex items-center gap-1 shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              💻 {cust.assignedOperator.name}
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
          <main className="flex-1 flex flex-col bg-waChatBg relative min-w-0">
            {selectedCustomer ? (
              <>
                {/* Header del Chat */}
                <div className="h-14 bg-waHeader border-b border-waBorder px-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-3 min-w-0 flex-1 mr-4">
                    <div className="w-10 h-10 rounded-full bg-waBorder flex items-center justify-center font-bold text-waText overflow-hidden shrink-0">
                      {selectedCustomer.profilePictureUrl ? <img src={selectedCustomer.profilePictureUrl} className="w-full h-full object-cover" alt="Avatar" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} /> : null}
                        <div style={{ display: selectedCustomer.profilePictureUrl ? 'none' : 'flex' }} className="w-full h-full items-center justify-center bg-waHeader font-bold text-waText">
                          {selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                    </div>
                    <div className="min-w-0 flex flex-col justify-center">
                      <div className="flex items-center space-x-2 min-w-0">
                        <h2 className="text-xs font-semibold text-waText truncate">{selectedCustomer.name && selectedCustomer.name !== selectedCustomer.phone && !selectedCustomer.name.startsWith('Cliente ') ? selectedCustomer.name : `+${selectedCustomer.phone}`}</h2>
                        {selectedCustomer.participatingOperators && selectedCustomer.participatingOperators.length > 0 && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 font-semibold whitespace-nowrap shrink-0" title={`Atendido por: ${selectedCustomer.participatingOperators.join(', ')}`}>
                            👥 {selectedCustomer.participatingOperators.join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-waTextMuted truncate">{selectedCustomer.phone}</p>
                    </div>
                  </div>

                  {/* Acciones del Chat */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={async () => {
                        try {
                          await fetch(dynamicApiBase ? `${dynamicApiBase}/api/customers/${selectedCustomer.id}/bot` : `/api/customers/${selectedCustomer.id}/bot`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ isBotActive: !selectedCustomer.isBotActive })
                          });
                        } catch (error) {
                          console.error("Error toggling bot:", error);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold shadow transition-colors ${selectedCustomer.isBotActive ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-waBorder hover:bg-waDark text-waText'}`}
                      title={selectedCustomer.isBotActive ? "Apagar el bot en este chat" : "Activar bot para este chat"}
                    >
                      🤖 {selectedCustomer.isBotActive ? 'Desactivar Bot' : 'Activar Bot'}
                    </button>

                    {selectedCustomer.conversationState === 'ARCHIVED' ? (
                      <button
                        onClick={() => handleUpdateState('PENDING')}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded font-medium shadow whitespace-nowrap"
                        title="Desarchivar esta conversación y volverla a la bandeja de entrada"
                      >
                        📥 Desarchivar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateState('ARCHIVED')}
                        className="bg-waDark hover:bg-waBorder border border-waBorder text-waText text-xs px-3 py-1.5 rounded font-medium transition shadow whitespace-nowrap"
                        title="Archivar conversación y vaciar de la bandeja principal"
                      >
                        📦 Archivar
                      </button>
                    )}
                  </div>
                </div>

                {/* Historial de Mensajes */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-waChatBg bg-wa-doodle">
                  {isLoadingMessages ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                      <div className="w-10 h-10 border-4 border-waAccent/20 rounded-full"></div>
                      <div className="w-10 h-10 border-4 border-waAccent border-t-transparent rounded-full animate-spin absolute"></div>
                      <p className="text-sm font-semibold text-waText bg-waDark/80 px-4 py-1.5 rounded-full backdrop-blur-sm">Cargando mensajes...</p>
                    </div>
                  ) : messages.map((m) => {
                    const isCustomer = m.senderType === 'CUSTOMER';
                    const isBot = m.senderType === 'BOT';
                    const isOperator = m.senderType === 'OPERATOR';

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col relative z-10 ${
                          isCustomer ? 'items-start' : isOperator ? 'items-end' : 'items-center'
                        }`}
                      >
                        <div
                          style={{ backgroundColor: isCustomer ? 'var(--waBubbleIn)' : (isOperator ? 'var(--waBubbleOut)' : 'var(--waBorder)'), color: isOperator || isCustomer ? 'var(--waText)' : 'var(--waTextMuted)' }}
                          className={`max-w-[75%] rounded-lg px-3.5 py-2 text-sm shadow ${
                            isCustomer
                              ? 'rounded-tl-none border border-waBorder'
                              : isOperator
                              ? 'rounded-tr-none'
                              : 'rounded-md text-center'
                          }`}
                        >
                          {/* Remitente Header */}
                          <div className="flex items-center justify-between text-[10px] opacity-75 mb-1 space-x-2 pb-1" style={{ color: 'var(--waText)' }}>
                            <span className="font-bold flex items-center gap-1">
                              {isCustomer ? (
                                `💬 ${selectedCustomer.name || 'Cliente'}`
                              ) : isBot ? (
                                '🤖 Bot Automático'
                              ) : (
                                <span className="opacity-80 px-1.5 py-0.5 rounded font-bold">
                                  👤 Rep: {m.operatorName || 'Operador'}
                                </span>
                              )}
                            </span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          <p className="whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--waText)' }}>{m.text}</p>

                          {/* Indicador de estado */}
                          {isOperator && (
                            <div className="text-[10px] text-right mt-1 opacity-75">
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
                <form onSubmit={handleSendMessage} className="p-3 bg-waHeader border-t border-waBorder flex items-center space-x-2 shrink-0 relative">
                  {showQuickReplyMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-full max-w-lg bg-waDark border border-waBorder rounded-lg shadow-2xl overflow-hidden z-[100] flex flex-col max-h-64">
                      <div className="bg-waHeader px-3 py-1.5 border-b border-waBorder text-xs text-waTextMuted font-semibold">
                        Respuestas Rápidas
                      </div>
                      <div className="overflow-y-auto">
                        {filteredQuickReplies.map((qr, idx) => (
                          <div 
                            key={qr.id}
                            onClick={() => applyQuickReply(qr)}
                            className={`px-3 py-2 cursor-pointer border-b border-waBorder/50 last:border-0 ${idx === quickReplySelectedIndex ? 'bg-emerald-900/40' : 'hover:bg-waHeader'}`}
                          >
                            <div className="text-emerald-400 font-bold text-xs">{qr.shortcut}</div>
                            <div className="text-waText text-sm truncate opacity-90">{qr.text}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    ref={chatInputRef}
                    type="text"
                    placeholder={`Responder como ${userProfile?.displayName}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleQuickReplyKeyDown}
                    className="flex-1 bg-waDark border border-waBorder rounded-lg px-4 py-2 text-sm text-waText focus:outline-none focus:border-waAccent"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    className="bg-waAccent hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow transition"
                  >
                    {isSending ? 'Enviando...' : 'Enviar 🚀'}
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-waTextMuted text-xs">
                Selecciona una conversación del panel izquierdo para comenzar a chatear.
              </div>
            )}
          </main>

          {/* PANEL DERECHO: DETALLE DEL CLIENTE */}
          <aside className="w-80 bg-waHeader border-l border-waBorder flex flex-col shrink-0">
            {selectedCustomer ? (
              <div className="p-4 space-y-5 overflow-y-auto flex-1">
                
                {/* Info Cliente */}
                <div className="text-center space-y-2 border-b border-waBorder pb-4">
                  <div className="w-48 h-48 rounded-full bg-waBorder mx-auto flex items-center justify-center text-5xl font-bold text-waText shadow overflow-hidden mb-4 mt-2">
                    {selectedCustomer.profilePictureUrl ? <img src={selectedCustomer.profilePictureUrl} className="w-full h-full object-cover" alt="Avatar" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} /> : null}
                        <div style={{ display: selectedCustomer.profilePictureUrl ? 'none' : 'flex' }} className="w-full h-full items-center justify-center bg-waHeader font-bold text-waText">
                          {selectedCustomer.name ? selectedCustomer.name.charAt(0).toUpperCase() : 'C'}
                        </div>
                  </div>
                  <h3 className="text-lg font-semibold text-waText">{selectedCustomer.name && selectedCustomer.name !== selectedCustomer.phone && !selectedCustomer.name.startsWith('Cliente ') ? selectedCustomer.name : `+${selectedCustomer.phone}`}</h3>
                  <p className="text-sm text-waTextMuted mt-1 mb-2">{selectedCustomer.phone}</p>
                  {selectedCustomer.about && (
                    <div className="mt-4 p-4 bg-waBorder rounded-lg text-left w-full shadow-sm">
                      <p className="text-[11px] text-waTextMuted mb-1 font-semibold uppercase tracking-wider">Info.</p>
                      <p className="text-sm text-waText">{selectedCustomer.about}</p>
                    </div>
                  )}
                  <div className="inline-block bg-purple-900/60 text-purple-300 text-xs px-2.5 py-0.5 rounded font-medium">
                    {selectedCustomer.profileTag || 'Sin Triaje'}
                  </div>
                </div>

                {/* Etiquetas */}
                <div className="space-y-2 border-b border-waBorder pb-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-waTextMuted uppercase tracking-wider">Etiquetas del Cliente</h4>
                    <button 
                      onClick={() => setShowTagsModal(true)}
                      className="text-waTextMuted hover:text-waText transition"
                      title="Configurar Etiquetas"
                    >
                      ✏️
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.length === 0 ? (
                      <span className="text-[10px] text-waTextMuted italic">No hay etiquetas creadas. Usa el ✏️ para crear una.</span>
                    ) : (
                      availableTags.map((tag) => {
                        const hasTag = selectedCustomer.tags?.some((t) => t.tag.id === tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => handleToggleTag(tag.name)}
                            style={hasTag ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : {}}
                            className={`text-[11px] px-2 py-1 rounded transition border ${
                              hasTag
                                ? 'font-medium'
                                : 'bg-waDark border-waBorder text-waTextMuted hover:bg-waBorder'
                            }`}
                          >
                            {hasTag ? `✓ ${tag.name}` : `+ ${tag.name}`}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>



              </div>
            ) : (
              <div className="p-4 text-center text-xs text-waTextMuted">
                Ficha del cliente no disponible.
              </div>
            )}
          </aside>

        </div>
      )}

      {/* MODAL VINCULACIÓN CÓDIGO QR WHATSAPP */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-waHeader border border-waBorder rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-waTextMuted hover:text-waText text-lg font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-waText flex items-center justify-center gap-2">
                <span>📱 Vincular Celular por QR</span>
              </h3>
              <p className="text-xs text-waTextMuted leading-relaxed">
                Abre WhatsApp en tu teléfono -&gt; Menú / Ajustes -&gt; <strong>Dispositivos vinculados</strong> -&gt; <strong>Vincular un dispositivo</strong>.
              </p>
            </div>

            {isQrConnected ? (
              <div className="bg-emerald-950/50 border border-emerald-800/60 rounded-xl p-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
                  ✓
                </div>
                <h4 className="font-bold text-sm text-emerald-300">¡WhatsApp Conectado Exitosamente!</h4>
                <p className="text-xs text-waText">
                  Tu número {connectedPhone && <strong>+{connectedPhone}</strong>} ya está enlazado. Todos tus operadores pueden chatear libremente.
                </p>
              </div>
            ) : qrCodeData ? (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl inline-block shadow-inner border border-gray-300 relative">
                  <img src={qrCodeData} alt="Código QR WhatsApp" className="w-56 h-56 mx-auto" />
                </div>

                {/* Cuenta Regresiva de Validez del QR */}
                <div className="space-y-2 bg-waDark p-3 rounded-xl border border-waBorder">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-waTextMuted font-medium">⏱️ El Código QR se actualizará en:</span>
                    <span className={`font-bold font-mono text-sm px-2 py-0.5 rounded ${qrSecondsLeft <= 10 ? 'bg-red-950 text-red-400 border border-red-700 animate-pulse' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                      {qrSecondsLeft}s
                    </span>
                  </div>
                  <div className="w-full bg-waHeader rounded-full h-2 overflow-hidden border border-waBorder">
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
                <p className="text-xs text-waTextMuted">Generando Código QR en tiempo real...</p>
              </div>
            )}

            <div className="border-t border-waBorder pt-4 flex justify-between items-center text-xs text-waTextMuted">
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
          <div className="bg-waHeader border border-waBorder rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 text-left relative">
            <button
              onClick={() => setShowSoundModal(false)}
              className="absolute top-4 right-4 text-waTextMuted hover:text-waText text-lg font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-waText flex items-center gap-2">
                <span>🔔 Notificaciones de Sonido</span>
              </h3>
              <p className="text-xs text-waTextMuted">
                Ajusta las alertas sonoras al recibir nuevos mensajes de clientes.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {/* Interruptor Encendido/Apagado */}
              <div className="flex items-center justify-between bg-waDark p-3 rounded-xl border border-waBorder">
                <div>
                  <span className="text-xs font-semibold text-waText">Alertas de Sonido</span>
                  <p className="text-[10px] text-waTextMuted">Reproducir tono cuando entra un chat</p>
                </div>
                <button
                  onClick={() => {
                    const next = !isSoundEnabled;
                    setIsSoundEnabled(next);
                    localStorage.setItem('crm_sound_enabled', String(next));
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${isSoundEnabled ? 'bg-emerald-600 text-white' : 'bg-waBorder text-waTextMuted'}`}
                >
                  {isSoundEnabled ? 'ACTIVADO' : 'APAGADO'}
                </button>
              </div>

              {/* Slider de Volumen */}
              <div className="space-y-1.5 bg-waDark p-3 rounded-xl border border-waBorder">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-waText">Volumen</span>
                  <span className="text-waAccent font-bold">{soundVolume}%</span>
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
                  className="w-full accent-waAccent cursor-pointer"
                />
              </div>

              {/* Selector de Tono */}
              <div className="space-y-1.5 bg-waDark p-3 rounded-xl border border-waBorder">
                <span className="text-xs font-semibold text-waText">Tono de Notificación</span>
                <select
                  value={soundType}
                  onChange={(e) => {
                    const t = e.target.value;
                    setSoundType(t);
                    localStorage.setItem('crm_sound_type', t);
                  }}
                  className="w-full bg-waHeader border border-waBorder rounded px-3 py-1.5 text-xs text-waText focus:outline-none focus:border-waAccent cursor-pointer"
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

      {showTagsModal && (
        <TagsConfigModal 
          onClose={() => setShowTagsModal(false)}
          dynamicApiBase={dynamicApiBase}
          availableTags={availableTags}
          fetchTags={fetchTags}
        />
      )}

      {showQuickRepliesModal && (
        <QuickRepliesConfigModal 
          onClose={() => setShowQuickRepliesModal(false)}
          dynamicApiBase={dynamicApiBase}
          quickReplies={quickReplies}
          fetchQuickReplies={fetchQuickReplies}
        />
      )}

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

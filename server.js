require("dotenv").config();
const express = require('express');
const http = require('http'); // ← Agregar esta línea
const socketIo = require('socket.io'); // ← Agregar esta línea
const cors = require('cors');

const app = express();
const server = http.createServer(app); // ← Cambiar esto
const io = socketIo(server, { // ← Cambiar app por server
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: "http://localhost:5173", 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// Rutas (TODO ESTO SE MANTIENE IGUAL)
app.use('/api/usuarios', require("./routes/usuarios"));
app.use('/api/gastos', require("./routes/gastos"));
app.use('/api/metas', require("./routes/metas"));
app.use('/api/pagos', require("./routes/pagos"));
app.get("/", (req, res) => {
  res.send("API funcionando correctamente :");
});

// ===== SOCKET.IO - NUEVO CÓDIGO =====
const connectedUsers = new Map();
const chatMessages = [];

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  // Cuando un usuario se identifica (después de login)
  socket.on('user_identified', (userData) => {
    connectedUsers.set(socket.id, {
      ...userData,
      socketId: socket.id,
      isAdmin: userData.role === 'admin'
    });
    
    console.log('Usuario identificado:', userData.email);
    
    // Enviar historial de chat al usuario
    socket.emit('chat_history', chatMessages);
    
    // Notificar a los administradores
    io.emit('user_status_changed', {
      userCount: connectedUsers.size
    });
  });

  // Manejar mensajes de chat
  socket.on('send_message', (messageData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      userId: user.id,
      userName: user.nombre,
      userEmail: user.email,
      isAdmin: user.isAdmin,
      message: messageData.message,
      timestamp: new Date()
    };

    // Guardar mensaje
    chatMessages.push(message);
    
    // Limitar historial
    if (chatMessages.length > 100) {
      chatMessages.shift();
    }

    // Enviar mensaje a todos
    io.emit('new_message', message);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      io.emit('user_status_changed', {
        userCount: connectedUsers.size
      });
    }
    console.log('Usuario desconectado:', socket.id);
  });
});
// ===== FIN SOCKET.IO =====

const PORT = 5500;
// Cambiar app.listen por server.listen
server.listen(PORT, () => console.log(`Servidor local escuchando en puerto ${PORT}`));

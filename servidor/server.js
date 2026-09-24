const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { scrypt, randomBytes, timingSafeEqual, createHash } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../docs')));

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
let accountStore = { accounts: {} };
let sessions = new Map();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      accountStore = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('> Erro ao carregar accounts.json:', error);
  }
}

function saveAccounts() {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountStore, null, 2), 'utf8');
  } catch (error) {
    console.error('> Erro ao salvar accounts.json:', error);
  }
}

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      const now = Date.now();
      for (const [tokenHash, session] of Object.entries(data)) {
        if (session.expiresAt > now) sessions.set(tokenHash, session);
      }
    }
  } catch (error) {
    console.error('> Erro ao carregar sessions.json:', error);
  }
}

function saveSessions() {
  try {
    fs.writeFileSync(
      SESSIONS_FILE,
      JSON.stringify(Object.fromEntries(sessions.entries()), null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('> Erro ao salvar sessions.json:', error);
  }
}

loadAccounts();
loadSessions();

async function passwordHash(password, salt) {
  const buffer = await scryptAsync(password, salt, 64);
  return buffer.toString('hex');
}

function sessionKey(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validCredentials(username, password) {
  return (
    typeof username === 'string' &&
    username.length >= 3 &&
    username.length <= 24 &&
    /^[a-zA-Z0-9_]+$/.test(username) &&
    typeof password === 'string' &&
    password.length >= 6
  );
}

function createSession(accountKey) {
  const token = randomBytes(32).toString('hex');
  sessions.set(sessionKey(token), {
    accountKey,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  saveSessions();
  return token;
}

function getAuthenticatedSession(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const key = sessionKey(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt < Date.now()) {
    if (session) {
      sessions.delete(key);
      saveSessions();
    }
    return null;
  }

  const account = accountStore.accounts[session.accountKey];
  if (!account) return null;
  return { token, accountKey: session.accountKey, account };
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = String(username || '').trim();
  if (!validCredentials(cleanUsername, password)) {
    return res.status(400).json({
      ok: false,
      error: 'Usuário: 3–24 letras/números. Senha: mínimo de 6 caracteres.',
    });
  }

  const key = normalizeUsername(cleanUsername);
  if (accountStore.accounts[key]) {
    return res.status(409).json({ ok: false, error: 'Esse usuário já existe.' });
  }

  const salt = randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  accountStore.accounts[key] = {
    username: cleanUsername,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
  };
  saveAccounts();
  const token = createSession(key);
  return res.status(201).json({ ok: true, token, username: cleanUsername });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const key = normalizeUsername(username);
  const account = accountStore.accounts[key];
  if (!account || typeof password !== 'string') {
    return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
  }

  const candidate = Buffer.from(await passwordHash(password, account.salt), 'hex');
  const expected = Buffer.from(account.passwordHash, 'hex');
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
  }

  const token = createSession(key);
  return res.json({ ok: true, token, username: account.username });
});

app.get('/api/auth/session', (req, res) => {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Sessão expirada ou inválida.' });
  }
  return res.json({ ok: true, username: session.account.username });
});

app.post('/api/auth/logout', (req, res) => {
  const session = getAuthenticatedSession(req);
  if (session) {
    sessions.delete(sessionKey(session.token));
    saveSessions();
  }
  return res.json({ ok: true });
});

const salas = {};

function enviarEstadoSala(salaId) {
  const sala = salas[salaId];
  if (!sala) return;
  io.to(salaId).emit('atualizar_estado', {
    host: sala.host,
    instrumentos: sala.instrumentos,
    operadores: Object.values(sala.operadores).map((operador) => operador.nome),
  });
}

function criarSala() {
  const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();
  salas[salaId] = {
    host: null,
    instrumentos: { guitarra: null, baixo: null, bateria: null, teclado: null },
    operadores: {},
  };
  return salaId;
}

io.on('connection', (socket) => {
  console.log(`> Cliente conectado: ${socket.id}`);

  socket.on('criar_sala', (callback) => {
    const salaId = criarSala();
    if (typeof callback === 'function') callback({ salaId });
  });

  socket.on('entrar_sala', ({ salaId, operadorId, operadorNome } = {}) => {
    if (!salaId) return;
    if (!salas[salaId]) {
      salas[salaId] = {
        host: null,
        instrumentos: { guitarra: null, baixo: null, bateria: null, teclado: null },
        operadores: {},
      };
    }

    const id = operadorId || operadorNome;
    socket.join(salaId);
    socket.data.salaId = salaId;
    socket.data.operadorId = id;
    socket.data.operadorNome = operadorNome || id;
    socket.username = operadorNome || id;
    if (!salas[salaId].host) salas[salaId].host = id;
    salas[salaId].operadores[id] = { socketId: socket.id, nome: operadorNome || id };
    enviarEstadoSala(salaId);
  });

  socket.on('kick_player', ({ roomId, targetUsername } = {}) => {
    const sala = salas[roomId];
    if (!sala || sala.host !== socket.username || !targetUsername) return;

    const targetEntry = Object.entries(sala.operadores).find(([id, operador]) => (
      id === targetUsername || operador.nome === targetUsername
    ));
    if (!targetEntry || targetEntry[0] === socket.username) return;

    const [targetId] = targetEntry;
    delete sala.operadores[targetId];
    for (const instrumento of Object.keys(sala.instrumentos)) {
      if (sala.instrumentos[instrumento] === targetId) sala.instrumentos[instrumento] = null;
    }

    io.to(roomId).emit('room_updated', sala);

    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket && targetSocket.username === targetUsername) {
          targetSocket.leave(roomId);
          targetSocket.data.salaId = null;
          targetSocket.emit('player_kicked', {
            username: targetUsername,
            message: 'Você foi expulso da sala pelo criador.',
          });
          break;
        }
      }
    }

    enviarEstadoSala(roomId);
  });

  socket.on('escolher_instrumento', ({ salaId, instrumento, operadorId, operadorNome } = {}) => {
    const sala = salas[salaId];
    const id = operadorId || operadorNome;
    if (!sala || !id || !Object.hasOwn(sala.instrumentos, instrumento)) return;

    if (sala.instrumentos[instrumento] === id) {
      sala.instrumentos[instrumento] = null;
    } else {
      for (const inst of Object.keys(sala.instrumentos)) {
        if (sala.instrumentos[inst] === id) sala.instrumentos[inst] = null;
      }
      if (!sala.instrumentos[instrumento]) sala.instrumentos[instrumento] = id;
    }
    enviarEstadoSala(salaId);
  });

  socket.on('disconnect', () => {
    const { salaId, operadorId } = socket.data;
    if (!salaId || !salas[salaId]) return;

    const sala = salas[salaId];
    delete sala.operadores[operadorId];
    for (const inst of Object.keys(sala.instrumentos)) {
      if (sala.instrumentos[inst] === operadorId) sala.instrumentos[inst] = null;
    }

    if (sala.host === operadorId) {
      sala.host = Object.keys(sala.operadores)[0] || null;
    }

    const socketsNaSala = io.sockets.adapter.rooms.get(salaId);
    if (!socketsNaSala || socketsNaSala.size === 0) {
      delete salas[salaId];
    } else {
      enviarEstadoSala(salaId);
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`> Servidor rodando na porta ${PORT}`);
});
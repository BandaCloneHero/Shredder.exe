const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Libera os arquivos da sua pasta 'docs'
app.use(express.static(path.join(__dirname, '../docs')));

// Memória de salas ativas
const salas = {};

io.on('connection', (socket) => {
  console.log(`> Novo cliente conectado: ${socket.id}`);

  // Criar nova sala
  socket.on('criar_sala', (callback) => {
    const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();

    salas[salaId] = {
      instrumentos: { guitarra: null, baixo: null, bateria: null, teclado: null },
      operadores: {}
    };

    callback?.({ salaId });
    console.log(`> Sala criada: ${salaId}`);
  });

  // Entrar em uma sala existente (via QR Code)
  socket.on('entrar_sala', ({ salaId, operadorNome }, callback) => {
    salaId = String(salaId || '').trim().toUpperCase();
    operadorNome = String(operadorNome || '').trim();
    if (!salaId || !operadorNome || !salas[salaId]) {
      callback?.({ ok: false, erro: 'Sala não encontrada.' });
      return;
    }

    socket.join(salaId);
    socket.data.salaId = salaId;
    socket.data.operadorNome = operadorNome;
    salas[salaId].operadores[socket.id] = operadorNome;

    callback?.({ ok: true });
    console.log(`> Operador ${operadorNome} (${socket.id}) entrou na sala ${salaId}`);
    enviarEstadoAtualizado(salaId);
  });

  // Escolher ou liberar um instrumento dentro da sala
  socket.on('escolher_instrumento', ({ salaId, instrumento, operadorNome }) => {
    salaId = String(salaId || '').trim().toUpperCase();
    instrumento = String(instrumento || '').trim().toLowerCase();
    operadorNome = String(operadorNome || '').trim();
    const sala = salas[salaId];
    if (!sala || socket.data.salaId !== salaId || socket.data.operadorNome !== operadorNome || !Object.hasOwn(sala.instrumentos, instrumento)) return;

    if (sala.instrumentos[instrumento] === operadorNome) {
      sala.instrumentos[instrumento] = null;
    } else if (sala.instrumentos[instrumento] === null) {
      for (const inst in sala.instrumentos) {
        if (sala.instrumentos[inst] === operadorNome) sala.instrumentos[inst] = null;
      }
      sala.instrumentos[instrumento] = operadorNome;
    }

    enviarEstadoAtualizado(salaId);
  });

  // Desconexão limpa o operador e a sala vazia
  socket.on('disconnect', () => {
    const salaId = socket.data.salaId;
    const operadorNome = socket.data.operadorNome;

    if (salaId && salas[salaId]) {
      const sala = salas[salaId];
      delete sala.operadores[socket.id];

      for (const inst in sala.instrumentos) {
        if (sala.instrumentos[inst] === operadorNome) sala.instrumentos[inst] = null;
      }

      const socketsNaSala = io.sockets.adapter.rooms.get(salaId);
      if (!socketsNaSala || socketsNaSala.size === 0) {
        delete salas[salaId];
        console.log(`> Sala ${salaId} esvaziou e foi apagada.`);
      } else {
        enviarEstadoAtualizado(salaId);
      }
    }

    console.log(`> Cliente desconectado: ${socket.id}`);
  });
});

function enviarEstadoAtualizado(salaId) {
  const sala = salas[salaId];
  if (!sala) return;

  io.to(salaId).emit('atualizar_estado', {
    instrumentos: sala.instrumentos,
    operadores: Object.values(sala.operadores)
  });
}

server.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
const http = require('http');
const express = require('express');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../docs'))); // Serve os ficheiros da sua pasta de front-end

// Salas ativas guardadas em memória (como o Map de salas deles)
const salas = {};

io.on('connection', (socket) => {
  console.log(`> Novo cliente conectado: ${socket.id}`);

  // Criar uma nova sala com ID único
  socket.on('criar_sala', (callback) => {
    const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();
    salas[salaId] = {
      instrumentos: { guitarra: null, baixo: null, bateria: null, teclado: null },
      operadores: {}
    };
    callback({ salaId });
  });

  // Entrar na sala existente
  socket.on('entrar_sala', ({ salaId, operadorNome }) => {
    const operadorId = operadorNome;
    if (!salas[salaId]) {
      salas[salaId] = {
        instrumentos: { guitarra: null, baixo: null, bateria: null, teclado: null },
        operadores: {}
      };
    }

    socket.join(salaId);
    socket.data.salaId = salaId;
    socket.data.operadorId = operadorId;
    socket.data.operadorNome = operadorNome;

    // Regista o operador na sala
    salas[salaId].operadores[operadorId] = { socketId: socket.id, nome: operadorNome };

    enviarEstadoSala(salaId);
  });

  // Escolher ou soltar instrumento (Mutuamente exclusivo)
  socket.on('escolher_instrumento', ({ salaId, instrumento, operadorNome }) => {
    const operadorId = operadorNome;
    const sala = salas[salaId];
    if (!sala) return;

    // Se já for dele, desmarca (liberta)
    if (sala.instrumentos[instrumento] === operadorId) {
      sala.instrumentos[instrumento] = null;
    } else {
      // Retira de qualquer outro instrumento que ele estivesse a usar antes
      for (let inst in sala.instrumentos) {
        if (sala.instrumentos[inst] === operadorId) {
          sala.instrumentos[inst] = null;
        }
      }
      // Ocupa o novo instrumento se estiver livre
      if (!sala.instrumentos[instrumento]) {
        sala.instrumentos[instrumento] = operadorId;
      }
    }

    enviarEstadoSala(salaId);
  });

  // Desconexão limpa (Garante que sai da lista e liberta o instrumento)
  socket.on('disconnect', () => {
    const { salaId, operadorId } = socket.data;
    if (salaId && salas[salaId]) {
      const sala = salas[salaId];
      
      delete sala.operadores[operadorId];

      for (let inst in sala.instrumentos) {
        if (sala.instrumentos[inst] === operadorId) {
          sala.instrumentos[inst] = null;
        }
      }

      // Se a sala esvaziou completamente, apaga da memória
      const socketsNaSala = io.sockets.adapter.rooms.get(salaId);
      if (!socketsNaSala || socketsNaSala.size === 0) {
        delete salas[salaId];
        console.log(`> Sala vazia ${salaId} removida da memória.`);
      } else {
        enviarEstadoSala(salaId);
      }
    }
  });
});

function enviarEstadoSala(salaId) {
  const sala = salas[salaId];
  if (!sala) return;

  io.to(salaId).emit('atualizar_estado', {
    instrumentos: sala.instrumentos,
    operadores: Object.values(sala.operadores).map(op => op.nome)
  });
}

server.listen(3000, () => {
  console.log('Servidor de instrumentos rodando na porta 3000');
});
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

// AQUI ESTÁ O SEGREDO: 
// Diz para o servidor que os arquivos estáticos (HTML/CSS/JS) estão na pasta 'docs' na raiz do projeto
app.use(express.static(path.join(__dirname, '../docs')));

// Estado da sala
let salaEstado = {
  instrumentos: {
    guitarra: null,
    baixo: null,
    bateria: null,
    teclado: null
  }
};

io.on('connection', (socket) => {
  console.log(`> Um novo operador se conectou! ID: ${socket.id}`);

  // Envia o estado atual para quem acabou de entrar
  socket.emit('atualizar_estado', salaEstado);

  // Quando alguém escolhe um instrumento
  socket.on('escolher_instrumento', (dados) => {
    const instrumento = String(dados.instrumento || '').toLowerCase();
    const operadorNome = String(dados.operadorNome || '').trim();
    if (!operadorNome || !Object.prototype.hasOwnProperty.call(salaEstado.instrumentos, instrumento)) return;

    if (salaEstado.instrumentos[instrumento] === null) {
      for (const instrumentoAnterior in salaEstado.instrumentos) {
        if (salaEstado.instrumentos[instrumentoAnterior] === operadorNome) {
          salaEstado.instrumentos[instrumentoAnterior] = null;
        }
      }

      salaEstado.instrumentos[instrumento] = operadorNome;
      console.log(`> O operador ${operadorNome} escolheu: ${instrumento}`);

      // Atualiza todo mundo na sala
      io.emit('atualizar_estado', salaEstado);
    } else {
      console.log(`> Tentativa negada: ${instrumento} já está ocupado.`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`> Operador desconectado: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('Servidor rodando perfeitamente na porta 3000!');
});
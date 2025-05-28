const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const rooms = new Map(); // Store room metadata and messages
const clients = new Map(); // Track clients per room

wss.on('connection', ws => {
  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'join') {
        ws.roomId = data.roomId;
        if (!rooms.has(data.roomId)) {
          rooms.set(data.roomId, { messages: [], clients: new Set() });
        }
        rooms.get(data.roomId).clients.add(ws);
        clients.set(ws, data.roomId);
        ws.send(JSON.stringify({ type: 'messages', messages: rooms.get(data.roomId).messages }));
      } else if (data.type === 'message' && ws.roomId) {
        const msg = {
          nickname: data.nickname,
          iv: data.iv,
          data: data.data,
          time: data.time,
        };
        rooms.get(ws.roomId).messages.push(msg);
        rooms.get(ws.roomId).clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'message', message: msg }));
          }
        });
      } else if (data.type === 'leave' && ws.roomId) {
        const room = rooms.get(ws.roomId);
        if (room) {
          room.clients.delete(ws);
          if (room.clients.size === 0) {
            rooms.delete(ws.roomId);
            wss.clients.forEach(client => {
              if (client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'room_deleted' }));
              }
            });
          }
        }
        clients.delete(ws);
        ws.roomId = null;
      } else if (data.type === 'load_more' && ws.roomId) {
        const messages = rooms.get(ws.roomId)?.messages.slice(-data.limit) || [];
        ws.send(JSON.stringify({ type: 'messages', messages }));
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  });

  ws.on('close', () => {
    const roomId = clients.get(ws);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(ws);
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          wss.clients.forEach(client => {
            if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'room_deleted' }));
            }
          });
        }
      }
      clients.delete(ws);
    }
  });
});

console.log('WebSocket server running on ws://localhost:8080');

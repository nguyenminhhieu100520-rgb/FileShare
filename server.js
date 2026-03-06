const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const app = express();

// Render inject PORT tự động — chỉ dùng 1 port duy nhất
const PORT = process.env.PORT || 3000;

// Tạo HTTP server từ Express để PeerJS có thể gắn vào cùng port
const server = http.createServer(app);

// Gắn PeerJS signaling vào Express trên path /peerjs
// → Không cần port riêng, hoạt động tốt trên Render free tier
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: true,
});

app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  console.log(`🔗 Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
  console.log(`❌ Peer disconnected: ${client.getId()}`);
});

app.use(express.static('public'));

// Config endpoint — client fetch để biết cách kết nối PeerJS
app.get('/config', (req, res) => {
  const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  res.json({
    peerHost: req.hostname,   // domain thật của Render, ví dụ: myapp.onrender.com
    peerPort: isSecure ? 443 : PORT,
    peerPath: '/peerjs',
    secure: isSecure          // Render dùng HTTPS → WebSocket wss://
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server sẵn sàng tại port ${PORT}`);
  console.log(`   PeerJS path : /peerjs`);
  console.log(`   Config API  : /config\n`);
});

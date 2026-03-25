const { PeerServer } = require('peer');
const express = require('express');
const app = express();
const PORT = 3000;

// Cấu hình PeerServer với CORS cho phép localhost:3000
const peerServer = PeerServer({
  port: 9000,
  path: '/',                 // Đảm bảo path khớp với client
  allow_discovery: true,     // Cho phép client lấy danh sách ID (tùy chọn)
  cors: {
    origin: `http://localhost:${PORT}`,  // Cho phép origin của web
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

console.log('✅ PeerServer (signaling) đang chạy tại port 9000 với CORS cho http://localhost:3000');

// Phục vụ file tĩnh từ thư mục public
app.use(express.static('public'));
app.listen(PORT, () => {
  console.log(`✅ Web server đang chạy tại http://localhost:${PORT}`);
});
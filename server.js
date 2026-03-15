// ════════════════════════════════════════════════════════════════
//  server.js — Backend chính của ứng dụng P2P FileShare
//
//  Vai trò của file này:
//    1. Phục vụ file tĩnh (HTML/CSS/JS) cho trình duyệt
//    2. Chạy PeerJS Signaling Server — giúp 2 trình duyệt "tìm
//       thấy nhau" để thiết lập kết nối WebRTC P2P
//    3. Cung cấp endpoint /config để frontend tự lấy địa chỉ server
//
//  Lưu ý:
//    Sau khi 2 trình duyệt đã kết nối P2P, file KHÔNG đi qua
//    server này — server chỉ làm nhiệm vụ "môi giới" ban đầu.
// ════════════════════════════════════════════════════════════════


// ── IMPORT THƯ VIỆN ─────────────────────────────────────────────
// ExpressPeerServer: phiên bản PeerServer tích hợp vào Express,
//   dùng chung 1 port thay vì chạy riêng port 9000.
//   Bắt buộc khi deploy lên Render (free tier chỉ cho 1 port).
//   Tài liệu: https://github.com/peers/peerjs-server
const { ExpressPeerServer } = require('peer');

// express: framework web cho Node.js
//   Tài liệu: https://expressjs.com
const express = require('express');

// http: module tích hợp sẵn trong Node.js (không cần npm install)
//   Tạo HTTP server thô từ Express app vì PeerJS cần gắn trực tiếp
//   vào HTTP server để xử lý WebSocket upgrade request.
//   Tài liệu: https://nodejs.org/api/http.html
const http = require('http');

const app = express();


// ── CẤU HÌNH PORT ───────────────────────────────────────────────
// process.env.PORT: Render.com tự inject biến này khi deploy.
//   Nếu chạy local thì biến không tồn tại → fallback về 3000.
//   Tài liệu: https://nodejs.org/api/process.html#processenv
const PORT = process.env.PORT || 3000;


// ── TẠO HTTP SERVER ─────────────────────────────────────────────
// Tại sao không dùng app.listen() trực tiếp?
//   ExpressPeerServer cần tham chiếu đến HTTP server thô để lắng
//   nghe sự kiện WebSocket upgrade — Express app không đủ.
//   Ta sẽ gọi server.listen() ở cuối file thay vì app.listen().
const server = http.createServer(app);


// ── PEERJS SIGNALING SERVER ─────────────────────────────────────
// Signaling Server làm gì?
//   WebRTC cần trao đổi "SDP offer/answer" và "ICE candidates"
//   giữa 2 trình duyệt trước khi kết nối P2P trực tiếp.
//   PeerServer đóng vai trò trung gian truyền các thông tin này.
//   Sau khi trao đổi xong → dữ liệu file truyền thẳng P2P,
//   không qua server nữa.
//
//   Tìm hiểu thêm về WebRTC signaling:
//   https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
//
// allow_discovery: false → [BẢO MẬT]
//   Nếu true: ai cũng có thể GET /peerjs/peers để lấy toàn bộ
//   danh sách Peer ID đang online → lộ thông tin người dùng.
//   Đặt false để chặn hoàn toàn endpoint này.
const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: false,
});

// Mount PeerServer vào đường dẫn /peerjs trong Express.
// Frontend kết nối tới: wss://your-app.onrender.com/peerjs
// Dùng /peerjs (không dùng /) để tránh xung đột với route khác.
app.use('/peerjs', peerServer);

// Log sự kiện kết nối/ngắt kết nối Peer — hữu ích khi debug.
// client.getId() trả về Peer ID ngẫu nhiên server đã cấp cho peer đó.
peerServer.on('connection', (client) => {
    console.log(`🔗 Peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
    console.log(`❌ Peer disconnected: ${client.getId()}`);
});


// ── RATE LIMITING ────────────────────────────────────────────────
// Mục đích: ngăn bot spam hàng nghìn request/giây vào /config,
//   tránh làm quá tải server (DoS đơn giản).
//
// Cơ chế Sliding Window Counter:
//   Mỗi IP có bộ đếm (count) và thời điểm reset (resetAt).
//   Nếu 1 IP vượt MAX request trong WINDOW ms → trả lỗi 429.
//
// Nâng cao hơn: dùng thư viện express-rate-limit
//   https://www.npmjs.com/package/express-rate-limit

// Map lưu trạng thái từng IP: key=IP, value={ count, resetAt }
// Map hiệu quả hơn plain object khi thêm/xóa nhiều key liên tục.
// Tài liệu Map: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
    // x-forwarded-for: header do Render/proxy thêm vào, chứa IP
    //   thật của người dùng (request đi qua reverse proxy của Render).
    //   req.socket.remoteAddress: IP kết nối trực tiếp (dùng khi local).
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    const now = Date.now();     // ms từ epoch — dùng để so sánh thời gian
    const WINDOW = 60 * 1000;  // cửa sổ thời gian: 60,000 ms = 60 giây
    const MAX = 30;             // tối đa 30 request / 60 giây / IP

    let entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        // IP mới hoặc đã qua cửa sổ → tạo bộ đếm mới
        entry = { count: 1, resetAt: now + WINDOW };
    } else {
        // Còn trong cửa sổ → tăng bộ đếm
        entry.count++;
    }
    rateLimitMap.set(ip, entry);

    if (entry.count > MAX) {
        // HTTP 429 Too Many Requests: status code chuẩn cho rate limit
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429
        return res.status(429).json({ error: 'Too many requests. Vui lòng thử lại sau.' });
    }

    // next(): gọi middleware/handler tiếp theo trong chuỗi Express.
    // Nếu không gọi next() → request bị "treo", không được xử lý tiếp.
    next();
}

// Dọn dẹp Map định kỳ để tránh memory leak.
// Nếu không dọn: theo thời gian Map tích lũy hàng triệu IP cũ
//   → RAM tăng dần không kiểm soát được.
// setInterval: https://nodejs.org/api/timers.html#setintervalcallback-delay-args
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60 * 1000); // chạy mỗi 5 phút


// ── PHỤC VỤ FILE TĨNH ───────────────────────────────────────────
// express.static('public'): tự động trả file trong /public khi
//   trình duyệt request.
//   Ví dụ: GET /       → /public/index.html
//          GET /app.js → /public/app.js
//   Tài liệu: https://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));


// ── ENDPOINT /config ─────────────────────────────────────────────
// Tại sao cần endpoint này?
//   Frontend cần biết địa chỉ PeerServer để kết nối.
//   Nếu hardcode "localhost:9000" trong HTML → sai khi deploy.
//   Thay vào đó, server tự trả về thông tin đúng theo môi trường.
//   Cách đọc thêm về REST API design:
//   https://restfulapi.net/
//
// Middleware rateLimit được áp dụng trước handler chính.
app.get('/config', rateLimit, (req, res) => {

    // ── Phát hiện HTTPS ──────────────────────────────────────────
    // Render dùng reverse proxy nên req.secure luôn false.
    // Phải đọc x-forwarded-proto do proxy inject vào.
    const proto    = req.headers['x-forwarded-proto'] || '';
    const isSecure = proto.split(',')[0].trim() === 'https' || req.secure;

    // ── Lấy hostname đúng trên Render ────────────────────────────
    // Vấn đề: req.hostname trên Render đôi khi trả về hostname nội bộ
    //   (dạng 10.x.x.x hoặc render-internal-hostname) thay vì domain thật.
    //
    // Thứ tự ưu tiên:
    //   1. x-forwarded-host — header Render inject chứa domain trình duyệt đã dùng
    //      VD: "fileshare-1-c7sh.onrender.com"
    //   2. host — header HTTP chuẩn, trình duyệt gửi kèm mọi request
    //      VD: "fileshare-1-c7sh.onrender.com:443" hoặc "localhost:3000"
    //   3. req.hostname — Express parse từ host header (bỏ port)
    //
    // Với host header có thể chứa ":port", cần tách lấy phần hostname.
    const fwdHost  = req.headers['x-forwarded-host'];
    const hostHdr  = req.headers['host'] || '';
    const rawHost  = fwdHost || hostHdr;
    // Tách hostname khỏi port (VD: "localhost:3000" → "localhost")
    const peerHost = rawHost.split(':')[0] || req.hostname;

    // ── Xác định port ────────────────────────────────────────────
    // HTTPS trên Render → port 443 (chuẩn, không cần ghi trong URL)
    // HTTP local        → PORT của server (thường 3000)
    const peerPort = isSecure ? 443 : PORT;

    // Log để debug trên Render (xem trong Logs tab)
    console.log(`[/config] host=${peerHost} port=${peerPort} secure=${isSecure} | fwd-host=${fwdHost} host-hdr=${hostHdr} proto=${proto}`);

    res.json({
        peerHost,
        peerPort,
        peerPath: '/peerjs',
        secure:   isSecure,
    });
});


// ── KHỞI ĐỘNG SERVER ─────────────────────────────────────────────
// '0.0.0.0': lắng nghe trên TẤT CẢ network interface.
//   'localhost' → chỉ nhận request từ chính máy đó (127.0.0.1)
//   '0.0.0.0'  → nhận từ mọi thiết bị: LAN, Internet, cloud
//   Bắt buộc khi deploy cloud hoặc muốn thiết bị LAN truy cập.
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server sẵn sàng tại port ${PORT}`);
    console.log(`   PeerJS path : /peerjs`);
    console.log(`   Config API  : /config\n`);
});

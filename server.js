require('dotenv').config();
const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { Server } = require("socket.io");
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
app.set('trust proxy', 1);

// JSON body parser for REST APIs
app.use(express.json());

// Session setup
const sessionMiddleware = session({
    secret: 'p2p-file-share-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true in production with HTTPS
});
app.use(sessionMiddleware);

// ── MONGODB CONNECTION & SCHEMAS ──────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Thiếu MONGODB_URI trong biến môi trường!");
    console.error("Vui lòng tạo file .env hoặc thiết lập MONGODB_URI trên Render.");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Kết nối MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    hash: { type: String, required: true },
    friends: [{ type: String }]
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    senderId: { type: String, required: true },
    targetId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Number, required: true }
});
const Message = mongoose.model('Message', messageSchema);

// Clean old messages (older than 3 days)
async function cleanOldMessages() {
    try {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - threeDaysMs;
        const result = await Message.deleteMany({ timestamp: { $lt: cutoff } });
        if (result.deletedCount > 0) {
            console.log(`🧹 Đã dọn dẹp ${result.deletedCount} tin nhắn quá 3 ngày.`);
        }
    } catch (err) {
        console.error('Lỗi khi dọn dẹp tin nhắn cũ:', err);
    }
}
setInterval(cleanOldMessages, 60 * 60 * 1000); // 1 hour

// ── HTTPS REDIRECT & SECURITY ────────────────────────────────────
app.use((req, res, next) => {
    const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    if (!isSecure && !isLocal) {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});
app.disable('x-powered-by');

// CSP and other headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', 
        `default-src 'self'; ` +
        `script-src 'self' https://cdnjs.cloudflare.com https://unpkg.com 'unsafe-inline' 'unsafe-eval'; ` +
        `style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; ` +
        `font-src 'self' https://fonts.gstatic.com; ` +
        `connect-src 'self' ws: wss:; ` +
        `img-src 'self' data: blob:; ` +
        `frame-ancestors 'none';`
    );
    next();
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// ── SOCKET.IO CHAT & PRESENCE ─────────────────────────────────────
const io = new Server(server, { cors: { origin: "*" } });
io.engine.use(sessionMiddleware);

const onlineUsers = new Map(); // socket.id -> userId
const userSockets = new Map(); // userId -> socket.id

io.on('connection', async (socket) => {
    const reqSession = socket.request.session;
    if (reqSession && reqSession.userId) {
        const userId = reqSession.userId;
        onlineUsers.set(socket.id, userId);
        userSockets.set(userId, socket.id);
        
        // Notify user's friends that user is online
        try {
            const user = await User.findOne({ id: userId });
            if (user && user.friends) {
                user.friends.forEach(fId => {
                    const fSocketId = userSockets.get(fId);
                    if (fSocketId) {
                        io.to(fSocketId).emit('friend_status', { id: userId, status: 'online' });
                    }
                });
                
                // Send to user their friends' status
                const friendStatuses = user.friends.map(fId => ({
                    id: fId,
                    status: userSockets.has(fId) ? 'online' : 'offline'
                }));
                socket.emit('friends_statuses', friendStatuses);
            }
        } catch (err) {
            console.error('Lỗi khi lấy thông tin bạn bè socket:', err);
        }
    }

    socket.on('disconnect', async () => {
        const userId = onlineUsers.get(socket.id);
        if (userId) {
            onlineUsers.delete(socket.id);
            userSockets.delete(userId);
            
            try {
                const user = await User.findOne({ id: userId });
                if (user && user.friends) {
                    user.friends.forEach(fId => {
                        const fSocketId = userSockets.get(fId);
                        if (fSocketId) {
                            io.to(fSocketId).emit('friend_status', { id: userId, status: 'offline' });
                        }
                    });
                }
            } catch (err) {}
        }
    });

    socket.on('send_message', async (data) => {
        const senderId = onlineUsers.get(socket.id);
        if (!senderId) return;

        const { targetId, content } = data;
        const messageId = crypto.randomUUID();
        const timestamp = Date.now();
        
        const messageDoc = new Message({
            id: messageId,
            senderId,
            targetId,
            content,
            timestamp
        });
        
        try {
            await messageDoc.save();
            
            const message = { id: messageId, senderId, targetId, content, timestamp };
            
            // Send to receiver if online
            const targetSocketId = userSockets.get(targetId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('receive_message', message);
            }
            
            // Send back to sender
            socket.emit('receive_message', message);
        } catch (err) {
            console.error('Lỗi lưu tin nhắn:', err);
        }
    });
});

// ── REST API ROUTES ───────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu username/password' });
        
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

        const id = 'ID-' + Math.floor(100000 + Math.random() * 900000);
        const hash = await bcrypt.hash(password, 10);
        
        const newUser = new User({ id, username, hash, friends: [] });
        await newUser.save();
        
        res.json({ success: true, user: { id, username } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: 'Sai thông tin đăng nhập' });

        const match = await bcrypt.compare(password, user.hash);
        if (!match) return res.status(400).json({ error: 'Sai thông tin đăng nhập' });

        req.session.userId = user.id;
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const user = await User.findOne({ id: req.session.userId });
        if (!user) return res.status(401).json({ error: 'User không tồn tại' });
        res.json({ user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/friends/add', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { friendId } = req.body;
        
        if (friendId === req.session.userId) return res.status(400).json({ error: 'Không thể tự kết bạn' });
        
        const user = await User.findOne({ id: req.session.userId });
        const friend = await User.findOne({ id: friendId });
        
        if (!friend) return res.status(404).json({ error: 'Không tìm thấy ID người dùng' });
        if (user.friends.includes(friendId)) return res.status(400).json({ error: 'Đã là bạn bè' });

        user.friends.push(friendId);
        if (!friend.friends.includes(user.id)) friend.friends.push(user.id);
        
        await user.save();
        await friend.save();
        
        res.json({ success: true, friend: { id: friend.id, username: friend.username } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/friends', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const user = await User.findOne({ id: req.session.userId });
        
        if (!user) return res.json({ friends: [] });

        const friendsData = await User.find({ id: { $in: user.friends } });
        
        const friendsList = friendsData.map(f => {
            return { id: f.id, username: f.username, status: userSockets.has(f.id) ? 'online' : 'offline' };
        });
        res.json({ friends: friendsList });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/messages/:friendId', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { friendId } = req.params;
        const userId = req.session.userId;
        
        const chatHistory = await Message.find({
            $or: [
                { senderId: userId, targetId: friendId },
                { senderId: friendId, targetId: userId }
            ]
        }).sort({ timestamp: 1 }); // Xếp theo thời gian cũ -> mới
        
        // Loại bỏ trường _id của mongoose khi trả về để cho sạch
        const cleanHistory = chatHistory.map(m => ({
            id: m.id,
            senderId: m.senderId,
            targetId: m.targetId,
            content: m.content,
            timestamp: m.timestamp
        }));
        
        res.json({ messages: cleanHistory });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ── PEERJS SIGNALING SERVER ─────────────────────────────────────
const peerServer = ExpressPeerServer(server, {
    path: '/',
    allow_discovery: false,
});
app.use('/peerjs', peerServer);

const rateLimitMap = new Map();
function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const WINDOW = 60 * 1000;
    const MAX = 30;
    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + WINDOW };
    } else {
        entry.count++;
    }
    rateLimitMap.set(ip, entry);
    if (entry.count > MAX) return res.status(429).json({ error: 'Too many requests.' });
    next();
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60 * 1000);

app.use(express.static('public'));

app.get('/config', rateLimit, (req, res) => {
    const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.secure;
    res.json({
        peerHost: req.hostname,
        peerPort: isSecure ? 443 : PORT,
        peerPath: '/peerjs',
        secure: isSecure,
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server sẵn sàng tại port ${PORT}`);
    console.log(`   PeerJS path : /peerjs`);
    console.log(`   Config API  : /config\n`);
});

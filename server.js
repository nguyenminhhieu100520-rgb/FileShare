const { ExpressPeerServer } = require('peer');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { Server } = require("socket.io");
const crypto = require('crypto');

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

// Data Directory
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

let db = { users: [], messages: [] };
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// Clean old messages (older than 3 days)
function cleanOldMessages() {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - threeDaysMs;
    const initialLen = db.messages.length;
    db.messages = db.messages.filter(m => m.timestamp > cutoff);
    if (db.messages.length !== initialLen) {
        saveDB();
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

io.on('connection', (socket) => {
    const reqSession = socket.request.session;
    if (reqSession && reqSession.userId) {
        const userId = reqSession.userId;
        onlineUsers.set(socket.id, userId);
        userSockets.set(userId, socket.id);
        
        // Notify user's friends that user is online
        const user = db.users.find(u => u.id === userId);
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
    }

    socket.on('disconnect', () => {
        const userId = onlineUsers.get(socket.id);
        if (userId) {
            onlineUsers.delete(socket.id);
            userSockets.delete(userId);
            
            const user = db.users.find(u => u.id === userId);
            if (user && user.friends) {
                user.friends.forEach(fId => {
                    const fSocketId = userSockets.get(fId);
                    if (fSocketId) {
                        io.to(fSocketId).emit('friend_status', { id: userId, status: 'offline' });
                    }
                });
            }
        }
    });

    socket.on('send_message', (data) => {
        const senderId = onlineUsers.get(socket.id);
        if (!senderId) return;

        const { targetId, content } = data;
        const message = {
            id: crypto.randomUUID(),
            senderId,
            targetId,
            content,
            timestamp: Date.now()
        };
        db.messages.push(message);
        saveDB();

        // Send to receiver if online
        const targetSocketId = userSockets.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_message', message);
        }
        
        // Send back to sender
        socket.emit('receive_message', message);
    });
});

// ── REST API ROUTES ───────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu username/password' });
    if (db.users.find(u => u.username === username)) return res.status(400).json({ error: 'Username đã tồn tại' });

    const id = 'ID-' + Math.floor(100000 + Math.random() * 900000); // Ví dụ: ID-123456
    const hash = await bcrypt.hash(password, 10);
    const newUser = { id, username, hash, friends: [] };
    
    db.users.push(newUser);
    saveDB();
    res.json({ success: true, user: { id, username } });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Sai thông tin đăng nhập' });

    const match = await bcrypt.compare(password, user.hash);
    if (!match) return res.status(400).json({ error: 'Sai thông tin đăng nhập' });

    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, username: user.username } });
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const user = db.users.find(u => u.id === req.session.userId);
    if (!user) return res.status(401).json({ error: 'User không tồn tại' });
    res.json({ user: { id: user.id, username: user.username } });
});

app.post('/api/friends/add', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const { friendId } = req.body;
    
    if (friendId === req.session.userId) return res.status(400).json({ error: 'Không thể tự kết bạn' });
    
    const user = db.users.find(u => u.id === req.session.userId);
    const friend = db.users.find(u => u.id === friendId);
    
    if (!friend) return res.status(404).json({ error: 'Không tìm thấy ID người dùng' });
    if (user.friends.includes(friendId)) return res.status(400).json({ error: 'Đã là bạn bè' });

    user.friends.push(friendId);
    // Auto-accept cho đơn giản
    if (!friend.friends.includes(user.id)) friend.friends.push(user.id);
    
    saveDB();
    res.json({ success: true, friend: { id: friend.id, username: friend.username } });
});

app.get('/api/friends', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const user = db.users.find(u => u.id === req.session.userId);
    const friendsList = user.friends.map(fId => {
        const f = db.users.find(u => u.id === fId);
        return { id: f.id, username: f.username, status: userSockets.has(f.id) ? 'online' : 'offline' };
    });
    res.json({ friends: friendsList });
});

app.get('/api/messages/:friendId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const { friendId } = req.params;
    const userId = req.session.userId;
    
    const chatHistory = db.messages.filter(m => 
        (m.senderId === userId && m.targetId === friendId) || 
        (m.senderId === friendId && m.targetId === userId)
    );
    res.json({ messages: chatHistory });
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

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
// Bắt buộc cho Render (PaaS) dùng Reverse Proxy (Nginx/Cloudflare)
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

// ── SERVER-SIDE ENCRYPTION (CHAT) ─────────────────────────────────
const CHAT_MASTER_KEY = crypto.createHash('sha256').update(process.env.CHAT_MASTER_KEY || 'FileShare_Master_Key_Secret_123').digest();

function encryptMessage(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CHAT_MASTER_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptMessage(encryptedStr) {
    try {
        const parts = encryptedStr.split(':');
        // Nếu tin nhắn cũ chưa mã hóa (không có dấu ':') thì trả về nguyên bản
        if (parts.length !== 3) return encryptedStr; 
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', CHAT_MASTER_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Lỗi giải mã tin nhắn:', err);
        return '🔒 [Tin nhắn bị lỗi mã hóa]';
    }
}

// JSON body parser for REST APIs
app.use(express.json());

// Session setup - Tối ưu cho Production (Render)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'p2p-file-share-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: isProduction, // Yêu cầu HTTPS trên Render
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 ngày
    }
});
app.use(sessionMiddleware);

// ── MONGODB CONNECTION & SCHEMAS ──────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ LỖI NGHIÊM TRỌNG: Thiếu MONGODB_URI trong biến môi trường!");
    console.error("Vui lòng tạo file .env hoặc thiết lập MONGODB_URI trên Render.");
    process.exit(1);
}

// Cấu hình tối ưu MongoDB cho Cloud Hosting (Render/Atlas)
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Đợi 5s thay vì 30s mặc định
    socketTimeoutMS: 45000,         // Ngắt kết nối socket nếu không phản hồi
    maxPoolSize: 10                 // Giới hạn pool để không tốn RAM free tier
})
    .then(() => console.log('✅ Kết nối MongoDB thành công'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    nickname: { type: String, default: "" },
    hash: { type: String, required: true },
    friends: [{ type: String }],
    friendRequests: [{ type: String }]
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    senderId: { type: String, required: true },
    targetId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Number, required: true },
    status: { type: String, default: 'sent' },
    replyTo: { type: String, default: null },
    isDeleted: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', messageSchema);

const transferHistorySchema = new mongoose.Schema({
    userId: { type: String, required: true },
    partnerId: { type: String, required: true },
    partnerName: { type: String },
    role: { type: String, enum: ['sender', 'receiver'], required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    timestamp: { type: Number, required: true },
    status: { type: String, enum: ['completed', 'failed', 'cancelled'], default: 'completed' }
});
const TransferHistory = mongoose.model('TransferHistory', transferHistorySchema);

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
        `connect-src * 'unsafe-inline' ws: wss: blob: data: stun: turn:; ` +
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

        const { targetId, content, replyTo } = data;
        const messageId = crypto.randomUUID();
        const timestamp = Date.now();
        
        const encryptedContent = encryptMessage(content);
        
        const messageDoc = new Message({
            id: messageId,
            senderId,
            targetId,
            content: encryptedContent,
            timestamp,
            replyTo: replyTo || null
        });
        
        try {
            await messageDoc.save();
            
            const message = { id: messageId, senderId, targetId, content, timestamp, status: 'sent', replyTo: replyTo || null, isDeleted: false };
            
            // Send to receiver if online
            const targetSocketId = userSockets.get(targetId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('receive_message', message);
                // Also update status to delivered immediately since they are online
                messageDoc.status = 'delivered';
                await messageDoc.save();
                message.status = 'delivered';
            }
            
            // Send back to sender
            socket.emit('receive_message', message);
        } catch (err) {
            console.error('Lỗi lưu tin nhắn:', err);
        }
    });

    socket.on('delete_message', async (data) => {
        const senderId = onlineUsers.get(socket.id);
        if (!senderId) return;

        try {
            const { messageId } = data;
            const message = await Message.findOne({ id: messageId });
            
            // Chỉ cho phép người gửi thu hồi tin nhắn của chính họ
            if (message && message.senderId === senderId) {
                message.isDeleted = true;
                // Có thể xóa luôn content trong DB để đảm bảo bảo mật, hoặc giữ lại nội dung mã hóa
                // Để an toàn, ghi đè nội dung bằng rỗng được mã hóa
                message.content = encryptMessage('');
                await message.save();

                // Báo cho chính người xóa
                socket.emit('message_deleted', { messageId });

                // Báo cho người nhận nếu đang online
                const targetSocketId = userSockets.get(message.targetId);
                if (targetSocketId) {
                    io.to(targetSocketId).emit('message_deleted', { messageId });
                }
            }
        } catch (err) {
            console.error('Lỗi xóa tin nhắn:', err);
        }
    });

    socket.on('typing', (data) => {
        const senderId = onlineUsers.get(socket.id);
        if (!senderId) return;
        const targetSocketId = userSockets.get(data.targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('friend_typing', { senderId });
        }
    });

    socket.on('mark_all_read', async (data) => {
        const userId = onlineUsers.get(socket.id);
        if (!userId) return;
        try {
            await Message.updateMany(
                { senderId: data.friendId, targetId: userId, status: { $ne: 'read' } },
                { status: 'read' }
            );
            const friendSocketId = userSockets.get(data.friendId);
            if (friendSocketId) {
                io.to(friendSocketId).emit('all_messages_read', { targetId: userId });
            }
        } catch (err) {}
    });
});

// ── REST API ROUTES ───────────────────────────────────────────────

// API Ping để dùng cho UptimeRobot / Cron job tránh Render spin down
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu username/password' });
        
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

        const id = 'ID-' + Math.floor(100000 + Math.random() * 900000);
        const hash = await bcrypt.hash(password, 10);
        
        const newUser = new User({ id, username, hash, friends: [], friendRequests: [] });
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
        res.json({ success: true, user: { id: user.id, username: user.username, nickname: user.nickname } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/auth/profile', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { nickname } = req.body;
        const user = await User.findOne({ id: req.session.userId });
        if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
        user.nickname = nickname || "";
        await user.save();
        res.json({ success: true, user: { id: user.id, username: user.username, nickname: user.nickname } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const user = await User.findOne({ id: req.session.userId });
        if (!user) return res.status(401).json({ error: 'User không tồn tại' });
        res.json({ user: { id: user.id, username: user.username, nickname: user.nickname } });
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
        if (friend.friendRequests && friend.friendRequests.includes(user.id)) return res.status(400).json({ error: 'Đã gửi lời mời trước đó' });
        if (user.friendRequests && user.friendRequests.includes(friendId)) return res.status(400).json({ error: 'Người này đã gửi lời mời cho bạn' });

        if (!friend.friendRequests) friend.friendRequests = [];
        friend.friendRequests.push(user.id);
        
        await friend.save();
        
        // Cập nhật Socket: Báo cho người nhận nếu online
        const targetSocketId = userSockets.get(friendId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_friend_request', { 
                id: user.id, 
                username: user.username, 
                nickname: user.nickname 
            });
        }
        
        res.json({ success: true, message: 'Đã gửi lời mời kết bạn' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/friends/accept', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { friendId } = req.body;
        
        const user = await User.findOne({ id: req.session.userId });
        const friend = await User.findOne({ id: friendId });
        
        if (!friend) return res.status(404).json({ error: 'Không tìm thấy ID người dùng' });
        if (!user.friendRequests || !user.friendRequests.includes(friendId)) return res.status(400).json({ error: 'Không có lời mời kết bạn từ người này' });

        // Xóa khỏi danh sách request
        user.friendRequests = user.friendRequests.filter(id => id !== friendId);
        
        // Thêm vào bạn bè
        if (!user.friends.includes(friendId)) user.friends.push(friendId);
        if (!friend.friends.includes(user.id)) friend.friends.push(user.id);
        
        await user.save();
        await friend.save();
        
        // Báo cho người gửi rằng mình đã chấp nhận (tuỳ chọn)
        const senderSocketId = userSockets.get(friendId);
        if (senderSocketId) {
            io.to(senderSocketId).emit('friend_request_accepted', { id: user.id });
        }
        
        res.json({ success: true, friend: { id: friend.id, username: friend.username, nickname: friend.nickname } });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/friends/decline', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { friendId } = req.body;
        
        const user = await User.findOne({ id: req.session.userId });
        
        if (!user.friendRequests || !user.friendRequests.includes(friendId)) return res.status(400).json({ error: 'Không có lời mời kết bạn từ người này' });

        user.friendRequests = user.friendRequests.filter(id => id !== friendId);
        await user.save();
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/friends/requests', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const user = await User.findOne({ id: req.session.userId });
        if (!user || !user.friendRequests) return res.json({ requests: [] });

        const requestUsers = await User.find({ id: { $in: user.friendRequests } });
        const requestsList = requestUsers.map(u => ({
            id: u.id,
            username: u.username,
            nickname: u.nickname
        }));
        
        res.json({ requests: requestsList });
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
            return { id: f.id, username: f.username, nickname: f.nickname, status: userSockets.has(f.id) ? 'online' : 'offline' };
        });
        res.json({ friends: friendsList });
    } catch (err) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// --- Lịch sử truyền file ---
app.post('/api/transfer-history', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const { partnerId, partnerName, role, fileName, fileSize, status } = req.body;
        
        const history = new TransferHistory({
            userId: req.session.userId,
            partnerId,
            partnerName: partnerName || '',
            role,
            fileName,
            fileSize,
            timestamp: Date.now(),
            status: status || 'completed'
        });
        
        await history.save();
        res.json({ success: true, data: history });
    } catch (err) {
        console.error('Lỗi khi lưu lịch sử:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.get('/api/transfer-history', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        
        // Lấy 50 bản ghi gần nhất
        const histories = await TransferHistory.find({ userId: req.session.userId })
            .sort({ timestamp: -1 })
            .limit(50);
            
        res.json({ success: true, data: histories });
    } catch (err) {
        console.error('Lỗi khi lấy lịch sử:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.delete('/api/transfer-history/:id', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'Chưa đăng nhập' });
        const historyId = req.params.id;
        
        const result = await TransferHistory.deleteOne({ _id: historyId, userId: req.session.userId });
        
        if (result.deletedCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Không tìm thấy bản ghi' });
        }
    } catch (err) {
        console.error('Lỗi khi xóa lịch sử:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ── QUẢN LÝ ẢNH ĐẠI DIỆN VÀ FILE UPLOAD KHÁC (NẾU CÓ TRONG TƯƠNG LAI) ──────────

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
            content: m.isDeleted ? "" : decryptMessage(m.content),
            timestamp: m.timestamp,
            status: m.status || 'sent',
            replyTo: m.replyTo,
            isDeleted: m.isDeleted || false
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
    console.log(`   Môi trường : ${isProduction ? 'Production' : 'Development'}`);
    console.log(`   PeerJS path : /peerjs`);
    console.log(`   Config API  : /config\n`);
});

// Bắt lỗi toàn cục để không crash ngầm trên Render
process.on('uncaughtException', (err) => {
    console.error('❌ Lỗi không kiểm soát (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Lỗi Promise bị từ chối (unhandledRejection):', reason);
});

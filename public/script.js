// -- APP LOGIC (Tabs & Chat) --
        function switchTab(tab) {
            document.getElementById('view-file').style.display = tab === 'file' ? 'flex' : 'none';
            document.getElementById('view-chat').style.display = tab === 'chat' ? 'block' : 'none';
            document.getElementById('view-profile').style.display = tab === 'profile' ? 'block' : 'none';
            document.getElementById('menu-file').classList.toggle('active', tab === 'file');
            document.getElementById('menu-chat').classList.toggle('active', tab === 'chat');
            document.getElementById('menu-profile').classList.toggle('active', tab === 'profile');
            if ((tab === 'chat' || tab === 'profile') && !isLoggedIn) {
                checkAuth();
            }
        }

        let isRegisterMode = false;
        let isLoggedIn = false;
        let currentUser = null;
        let activeFriendId = null;
        let socket = null;

        function toggleAuthMode() {
            isRegisterMode = !isRegisterMode;
            document.getElementById('authTitle').innerText = isRegisterMode ? 'Đăng Ký' : 'Đăng Nhập';
            document.getElementById('authToggleText').innerText = isRegisterMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay';
            document.getElementById('authError').style.display = 'none';
        }

        async function handleAuth() {
            const user = document.getElementById('authUsername').value;
            const pass = document.getElementById('authPassword').value;
            const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
            
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: user, password: pass})
                });
                const data = await res.json();
                if (data.error) {
                    document.getElementById('authError').innerText = data.error;
                    document.getElementById('authError').style.display = 'block';
                } else {
                    if (isRegisterMode) {
                        showToast("Đăng ký thành công! Vui lòng đăng nhập lại.", "success");
                        document.getElementById('authPassword').value = '';
                        toggleAuthMode();
                    } else {
                        checkAuth();
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function checkAuth() {
            try {
                const res = await fetch('/api/auth/me');
                const data = await res.json();
                if (data.user) {
                    isLoggedIn = true;
                    currentUser = data.user;
                    document.getElementById('authSection').style.display = 'none';
                    document.getElementById('chatSection').style.display = 'flex';
                    document.getElementById('menu-profile').style.display = 'flex';
                    
                    document.getElementById('myAccountId').innerHTML = `ID: ${currentUser.id} <button onclick="navigator.clipboard.writeText('${currentUser.id}');showToast('Đã copy ID', 'success')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding-left:10px" title="Copy">📋</button>`;
                    
                    document.getElementById('profileUsername').value = currentUser.username;
                    document.getElementById('profileId').value = currentUser.id;
                    document.getElementById('profileNickname').value = currentUser.nickname || '';
                    document.getElementById('myDisplayName').innerText = currentUser.nickname || currentUser.username;

                    initSocket();
                    loadFriends();
                } else {
                    isLoggedIn = false;
                    document.getElementById('authSection').style.display = 'flex';
                    document.getElementById('chatSection').style.display = 'none';
                    document.getElementById('menu-profile').style.display = 'none';
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function logout() {
            await fetch('/api/auth/logout', { method: 'POST' });
            if (socket) socket.disconnect();
            socket = null;
            document.getElementById('menu-profile').style.display = 'none';
            switchTab('chat');
            checkAuth();
        }

        async function updateProfile() {
            const newNick = document.getElementById('profileNickname').value.trim();
            const res = await fetch('/api/auth/profile', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({nickname: newNick})
            });
            const data = await res.json();
            if (data.error) showToast(data.error, 'error');
            else {
                showToast('Cập nhật thông tin thành công!', 'success');
                checkAuth();
            }
        }

        async function addFriend() {
            const friendId = document.getElementById('addFriendId').value;
            if (!friendId) return;
            const res = await fetch('/api/friends/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({friendId})
            });
            const data = await res.json();
            if (data.error) showToast(data.error, 'error');
            else {
                showToast('Thêm bạn bè thành công!', 'success');
                document.getElementById('addFriendId').value = '';
                loadFriends();
            }
        }

        async function loadFriends() {
            const res = await fetch('/api/friends');
            const data = await res.json();
            const container = document.getElementById('friendsListContainer');
            container.innerHTML = '';
            
            data.friends.forEach(f => {
                const displayName = f.nickname ? f.nickname : f.username;
                const div = document.createElement('div');
                div.className = 'friend-item' + (activeFriendId === f.id ? ' active' : '');
                div.innerHTML = `
                    <div class="status-dot ${f.status === 'online' ? 'online' : ''}" id="status-${f.id}"></div>
                    <div>
                        <div style="font-weight:600">${displayName}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">${f.id}</div>
                    </div>
                `;
                div.onclick = () => selectFriend(f);
                container.appendChild(div);
            });
        }

        function selectFriend(f) {
            activeFriendId = f.id;
            const displayName = f.nickname ? f.nickname : f.username;
            document.getElementById('chatHeader').innerHTML = `
                <button class="mobile-back-btn" onclick="backToFriendsList()" style="display:none; background:none; border:none; color:var(--text); font-size:1.4rem; cursor:pointer; padding:0 10px 0 0;" title="Quay lại">❮</button>
                <div class="status-dot ${f.status === 'online' ? 'online' : ''}" id="header-status-${f.id}"></div>
                <span style="font-weight:600; font-size:1.1rem">${displayName}</span>
            `;
            document.getElementById('chatInputArea').style.visibility = 'visible';
            
            // Kích hoạt UI chat trên mobile
            document.getElementById('chatSection').classList.add('mobile-chat-active');
            
            loadFriends(); // update active class
            loadMessages(f.id);
        }

        function backToFriendsList() {
            document.getElementById('chatSection').classList.remove('mobile-chat-active');
            activeFriendId = null;
            loadFriends();
        }

        async function loadMessages(friendId) {
            const res = await fetch('/api/messages/' + friendId);
            const data = await res.json();
            const container = document.getElementById('chatMessages');
            container.innerHTML = '';
            data.messages.forEach(m => appendMessage(m));
            container.scrollTop = container.scrollHeight;
        }

        function appendMessage(m) {
            if ((m.senderId === activeFriendId && m.targetId === currentUser.id) ||
                (m.senderId === currentUser.id && m.targetId === activeFriendId)) {
                const container = document.getElementById('chatMessages');
                const div = document.createElement('div');
                div.className = 'msg ' + (m.senderId === currentUser.id ? 'sent' : 'recv');
                div.innerText = m.content;
                container.appendChild(div);
                container.scrollTop = container.scrollHeight;
            }
        }

        function sendMessage() {
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (!text || !activeFriendId || !socket) return;
            
            socket.emit('send_message', { targetId: activeFriendId, content: text });
            input.value = '';
        }

        function initSocket() {
            if (socket) return;
            socket = io();
            
            socket.on('friend_status', data => {
                const dot = document.getElementById('status-' + data.id);
                if (dot) {
                    if (data.status === 'online') dot.classList.add('online');
                    else dot.classList.remove('online');
                }
                const headerDot = document.getElementById('header-status-' + data.id);
                if (headerDot && activeFriendId === data.id) {
                    if (data.status === 'online') headerDot.classList.add('online');
                    else headerDot.classList.remove('online');
                }
            });

            socket.on('friends_statuses', list => {
                list.forEach(data => {
                    const dot = document.getElementById('status-' + data.id);
                    if (dot) {
                        if (data.status === 'online') dot.classList.add('online');
                        else dot.classList.remove('online');
                    }
                });
            });

            socket.on('receive_message', message => {
                // If message is from active friend or sent by us, append it
                if (activeFriendId && (message.senderId === activeFriendId || message.senderId === currentUser.id)) {
                    appendMessage(message);
                } else if (message.senderId !== currentUser.id) {
                    // Show notification dot on friend list if not active
                    // Optional enhancement
                }
            });
        }

// ════════════════════════════════════════════════════════════════
        //  MULTI-FILE P2P FILESHARE (OPTIMIZED)
        // ════════════════════════════════════════════════════════════════

        // ── ADAPTIVE CHUNK SIZE (AIMD) ────────────────────────────────────
        const adaptiveChunk = {
            size: 64 * 1024,   // kích thước hiện tại, bắt đầu 64KB
            min: 16 * 1024,   // sàn 16KB
            max: 256 * 1024,   // trần 256KB
            step: 8 * 1024,   // bước tăng mỗi lần ổn định
        };

        // Ngưỡng bufferedAmount của DataChannel
        const BUFFER_HIGH = 512 * 1024;  // > 512KB → giảm chunk, đợi
        const BUFFER_LOW = 128 * 1024;  // < 128KB → an toàn tăng chunk

        // Speed meter state
        const speedMeter = {
            bytes: 0,
            windowStart: 0,
            lastKBps: 0,
        };

        // ── STATE SENDER ─────────────────────────────────────────────────
        let fileQueue = [];
        let isSending = false; // đang gửi → không cho thêm/xóa
        let senderConn = null;

        // Bản đồ theo dõi bruteforce PIN trên Sender (peerId -> { count, lockUntil })
        const pinAttemptsMap = new Map();
        const MAX_PIN_ATTEMPTS = 5;
        const PIN_LOCK_MS = 30000;

        // Cơ chế khóa toàn cục (Global Lock) chống xoay vòng Peer ID
        let globalLockUntil = 0;
        let globalFailCount = 0;

        // ── STATE RECEIVER ───────────────────────────────────────────────
        let receiverConn = null;
        let currentRecvFile = null; // { chunks[], receivedBytes, expectedSize, name, totalChunks, fileIndex, encrypted }
        let recvFiles = [];   // [{ name, size, status: 'ok'|'err' }]

        // Hàng đợi decrypt tuần tự để tránh tranh chấp bộ nhớ/thứ tự chunk
        let _chunkQueue = Promise.resolve();
        function enqueueChunk(fn) {
            _chunkQueue = _chunkQueue.then(fn).catch(() => { });
        }

        let recvTotalBytes = 0;
        let recvExpectedTotal = 0;

        // Rate limit PIN ở phía Receiver (local UI lock)
        let pinAttempts = 0;
        let pinLockUntil = 0;

        let peer = null; // Thực thể PeerJS duy nhất

        const $ = id => document.getElementById(id);

        // ── SHARE LINK & QR ───────────────────────────────────────────────
        function buildShareLink(peerId) {
            const encoded = btoa(peerId); // base64 encode
            return `${location.origin}${location.pathname}?p=${encoded}`;
        }

        function showShareBox(peerId) {
            const link = buildShareLink(peerId);
            $('shareLinkText').textContent = link;
            $('shareBox').classList.add('show');
        }

        function copyShareLink() {
            const link = $('shareLinkText').textContent;
            navigator.clipboard.writeText(link)
                .then(() => showStatus('senderStatus', '✅ Đã copy link! Gửi cho người nhận.', 'ok'))
                .catch(() => showStatus('senderStatus', '⚠️ Không copy được, hãy copy thủ công.', 'warn'));
        }

        // QR Code
        function showQR() {
            const link = $('shareLinkText').textContent;
            if (!link) return;

            const container = $('qrContainer');
            container.innerHTML = '';

            new QRCode(container, {
                text: link,
                width: 240,
                height: 240,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            container.style.background = '#ffffff';
            container.style.padding = '12px';

            $('qrOverlay').classList.add('show');
        }

        function hideQR(e) {
            if (e && e.currentTarget === $('qrOverlay') && e.target !== $('qrOverlay')) return;
            $('qrOverlay').classList.remove('show');
        }

        // ── AUTO-FILL PEER ID TỪ URL PARAM ───────────────────────────────
        function autoFillFromURL() {
            const params = new URLSearchParams(location.search);
            const encoded = params.get('p');
            if (!encoded) return;
            try {
                const peerId = atob(encoded);
                const input = $('targetPeerId');
                const badge = $('autofillBadge');
                const card = input.closest('.card');

                input.value = peerId;
                badge.style.display = 'inline-block';

                const banner = $('receiverBanner');
                if (banner) banner.style.display = 'flex';

                input.style.borderColor = 'var(--green)';
                input.style.boxShadow = '0 0 0 2px rgba(63,185,80,0.25)';

                if (card) {
                    card.style.borderColor = 'var(--green)';
                    card.style.boxShadow = '0 0 0 3px rgba(63,185,80,0.15)';
                }

                setTimeout(() => {
                    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => $('receiverPin')?.focus(), 400);
                }, 300);

            } catch (e) {
                // Lỗi parse base64 -> bỏ qua
            }
        }

        document.addEventListener('DOMContentLoaded', autoFillFromURL);

        // ── HELPERS ───────────────────────────────────────────────────────
        function showStatus(id, msg, type = 'ok') {
            const el = $(id);
            el.textContent = msg;
            el.className = `status show ${type}`;
        }

        window.copyText = id => {
            let text = $(id).innerText;
            if ($(id).tagName === 'INPUT') {
                text = $(id).value;
            }
            return navigator.clipboard.writeText(text)
                .then(() => {
                    showStatus('senderStatus', '✅ Đã sao chép ID!', 'ok');
                    showStatus('receiverStatus', '✅ Đã sao chép ID!', 'ok');
                })
                .catch(() => { });
        };

        function formatBytes(b) {
            if (b < 1024) return b + ' B';
            if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
            return (b / 1048576).toFixed(2) + ' MB';
        }

        function setProgress(wrapId, barId, labelId, chunkId, pct, label, extra, done = false) {
            $(wrapId).className = 'progress-wrap show';
            const bar = $(barId);
            bar.style.width = pct + '%';
            bar.className = 'progress-bar' + (done ? ' done' : '');
            $(labelId).textContent = label;
            if (chunkId) $(chunkId).textContent = extra;
        }

        // Escape HTML để ngăn XSS khi render tên file vào innerHTML
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        }

        async function hashPin(pin) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Sinh thách thức ngẫu nhiên bảo mật (challenge)
        function generateRandomChallenge() {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        }

        // Tính toán phản hồi thử thách: SHA-256(pinHash + challenge)
        async function computeChallengeResponse(pin, challenge) {
            const pinHash = await hashPin(pin);
            const msgBuffer = new TextEncoder().encode(pinHash + challenge);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // ── AES-GCM ENCRYPTION ────────────────────────────────────────────
        const AES_PBKDF2_ITER = 200_000;

        let _aesKeyCache = null; // { pin, saltHex, key }

        async function deriveAESKey(pin, saltHex) {
            if (_aesKeyCache && _aesKeyCache.pin === pin && _aesKeyCache.saltHex === saltHex) return _aesKeyCache.key;

            const salt = new TextEncoder().encode(saltHex);
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(pin),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );
            const key = await crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: salt, iterations: AES_PBKDF2_ITER, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            _aesKeyCache = { pin, saltHex, key };
            return key;
        }

        async function encryptChunk(pin, plaintext, saltHex) {
            const key = await deriveAESKey(pin, saltHex);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                plaintext
            );
            const out = new Uint8Array(12 + ciphertext.byteLength);
            out.set(iv, 0);
            out.set(new Uint8Array(ciphertext), 12);
            return out.buffer;
        }

        async function decryptChunk(pin, encrypted, saltHex) {
            const key = await deriveAESKey(pin, saltHex);
            const iv = encrypted.slice(0, 12);
            const ciphertext = encrypted.slice(12);
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        }

        function clearAESKeyCache() { _aesKeyCache = null; }

        async function loadConfig() {
            try { const r = await fetch('/config'); return await r.json(); }
            catch { return { peerHost: 'localhost', peerPort: 9000, peerPath: '/peerjs', secure: false }; }
        }

        // ── QUEUE UI ──────────────────────────────────────────────────────
        function renderQueue() {
            const wrap = $('fileQueue');
            const list = $('queueList');
            const summary = $('queueSummary');

            if (fileQueue.length === 0) { wrap.style.display = 'none'; return; }
            wrap.style.display = 'block';

            const totalSize = fileQueue.reduce((s, f) => s + f.size, 0);
            summary.textContent = `${fileQueue.length} file · ${formatBytes(totalSize)}`;

            list.innerHTML = '';
            fileQueue.forEach((f, i) => {
                const icons = { pending: '📄', sending: '📤', done: '✅', error: '❌' };
                const statusText = { pending: 'Chờ', sending: 'Đang gửi', done: 'Xong', error: 'Lỗi' };
                const el = document.createElement('div');
                el.className = `queue-item ${f.status !== 'pending' ? f.status : ''}`;
                el.id = `qi-${i}`;
                const safeName = escapeHtml(f.name);
                el.innerHTML = `
            <span class="q-icon">${icons[f.status] || '📄'}</span>
            <span class="q-name" title="${safeName}">${safeName}</span>
            <span class="q-size">${formatBytes(f.size)}</span>
            <span class="q-status" style="color:${f.status === 'done' ? 'var(--green)' : f.status === 'error' ? 'var(--red)' : f.status === 'sending' ? 'var(--blue)' : 'var(--text-muted)'}">${statusText[f.status] || 'Chờ'}</span>
            ${!isSending ? `<button class="q-del" onclick="removeFromQueue(${i})" title="Xóa">✕</button>` : ''}
        `;
                list.appendChild(el);
            });
        }

        function updateQueueItemBar(i, pct) {
            const bar = $(`qbar-${i}`);
            if (bar) bar.style.width = pct + '%';
        }

        window.removeFromQueue = function (i) {
            if (isSending) return;
            fileQueue.splice(i, 1);
            renderQueue();
            if (fileQueue.length === 0) {
                $('sendBtn').disabled = true;
                showStatus('senderStatus', '', 'ok');
                $('senderStatus').className = 'status';
            }
        };

        window.clearQueue = function () {
            if (isSending) return;
            fileQueue = [];
            renderQueue();
            $('sendBtn').disabled = true;
        };

        // ── THÊM FILE VÀO QUEUE ───────────────────────────────────────────
        function addFilesToQueue(fileList) {
            let added = 0;
            for (const file of fileList) {
                const exists = fileQueue.some(f => f.name === file.name && f.size === file.size);
                if (!exists) {
                    fileQueue.push({ file, name: file.name, size: file.size, status: 'pending' });
                    added++;
                }
            }
            if (added > 0) {
                renderQueue();
                $('sendBtn').disabled = fileQueue.length === 0;
                showStatus('senderStatus', `✅ Đã thêm ${added} file vào hàng đợi`, 'ok');
            } else {
                showStatus('senderStatus', '⚠️ Các file này đã có trong hàng đợi', 'warn');
            }
        }

        // ── FILE INPUT & DROP ─────────────────────────────────────────────
        $('fileInput').addEventListener('change', e => {
            if (e.target.files.length > 0) addFilesToQueue(e.target.files);
            e.target.value = '';
        });

        const dropArea = $('dropArea');
        dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('dragover'); });
        dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
        dropArea.addEventListener('drop', e => {
            e.preventDefault();
            dropArea.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) addFilesToQueue(e.dataTransfer.files);
        });

        // ── NÚT "TẠO PHÒNG" ──────────────────────────────────────────────
        $('sendBtn').addEventListener('click', () => {
            if (fileQueue.length === 0) { showStatus('senderStatus', '⚠️ Chưa thêm file nào!', 'warn'); return; }
            if (!$('senderPin').value.trim()) { showStatus('senderStatus', '⚠️ Vui lòng đặt mã PIN!', 'warn'); return; }
            showStatus('senderStatus', `⏳ Đang chờ người nhận kết nối… (${fileQueue.length} file sẵn sàng)`, 'warn');
        });

        function generateRandomId(length = 10) {
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const array = new Uint8Array(length);
            crypto.getRandomValues(array);
            return Array.from(array, byte => chars[byte % chars.length]).join('');
        }

        // ── INIT PEER (SINGLE INSTANCE) ───────────────────────────────────
        async function initPeer() {
            const cfg = await loadConfig();
            const opts = { host: cfg.peerHost, port: cfg.peerPort, path: cfg.peerPath, secure: cfg.secure };

            const customId = generateRandomId(10);
            peer = new Peer(customId, opts);

            peer.on('open', id => {
                $('myPeerId').innerText = id;
                $('copyMyIdBtn').disabled = false;
                $('connectBtn').disabled = false;
                showShareBox(id);
            });

            peer.on('error', err => {
                showStatus('senderStatus', '❌ Lỗi Peer: ' + err.message, 'err');
                showStatus('receiverStatus', '❌ Lỗi Peer: ' + err.message, 'err');
            });

            // Lắng nghe kết nối đến (Sender mode)
            peer.on('connection', conn => {
                const remotePeerId = conn.peer;

                // 1. Kiểm tra khóa toàn cục (Global Lock)
                if (Date.now() < globalLockUntil) {
                    conn.on('open', () => {
                        const wait = Math.ceil((globalLockUntil - Date.now()) / 1000);
                        conn.send({ type: 'auth_result', ok: false, reason: `Hệ thống tạm khóa do nhập sai PIN liên tục. Vui lòng thử lại sau ${wait}s.` });
                        conn.close();
                    });
                    return;
                }

                // 2. Kiểm tra khóa cụ thể theo Peer ID (chống spam)
                const record = pinAttemptsMap.get(remotePeerId);
                if (record && Date.now() < record.lockUntil) {
                    conn.on('open', () => {
                        const wait = Math.ceil((record.lockUntil - Date.now()) / 1000);
                        conn.send({ type: 'auth_result', ok: false, reason: `Thiết bị bị tạm khóa. Thử lại sau ${wait}s.` });
                        conn.close();
                    });
                    return;
                }

                senderConn = conn;

                conn.on('open', () => {
                    showStatus('senderStatus', '📞 Đã kết nối — đang gửi yêu cầu xác thực…', 'warn');
                    // Sinh thách thức ngẫu nhiên
                    const challenge = generateRandomChallenge();
                    conn.challenge = challenge;
                    conn.send({ type: 'auth_challenge', challenge });
                });

                conn.on('data', async msg => {
                    if (msg.type === 'auth_response') {
                        let record = pinAttemptsMap.get(remotePeerId);
                        if (!record || Date.now() > record.lockUntil) {
                            record = { count: 0, lockUntil: 0 };
                        }

                        if (record.count >= MAX_PIN_ATTEMPTS) {
                            conn.send({ type: 'auth_result', ok: false, reason: 'Tài khoản bị khóa tạm thời 30 giây.' });
                            conn.close();
                            return;
                        }

                        const myPin = $('senderPin').value.trim();
                        if (!myPin) {
                            conn.send({ type: 'auth_result', ok: false, reason: 'Chưa đặt PIN ở phía gửi' });
                            return;
                        }

                        const expectedResponse = await computeChallengeResponse(myPin, conn.challenge);
                        if (msg.response !== expectedResponse) {
                            record.count++;
                            globalFailCount++;
                            // Khóa toàn cục lũy tiến: 5s * số lần sai toàn cục (tối đa 30s)
                            const globalLockDuration = Math.min(30000, globalFailCount * 5000);
                            globalLockUntil = Date.now() + globalLockDuration;

                            if (record.count >= MAX_PIN_ATTEMPTS) {
                                record.lockUntil = Date.now() + PIN_LOCK_MS;
                                pinAttemptsMap.set(remotePeerId, record);
                                conn.send({ type: 'auth_result', ok: false, reason: 'Sai PIN quá nhiều. Khóa 30s.' });
                                showStatus('senderStatus', `🚫 Khóa peer ${remotePeerId} do nhập sai PIN 5 lần.`, 'err');
                            } else {
                                pinAttemptsMap.set(remotePeerId, record);
                                conn.send({ type: 'auth_result', ok: false, reason: `Sai PIN (${record.count}/${MAX_PIN_ATTEMPTS})` });
                                showStatus('senderStatus', `🚫 Peer ${remotePeerId} nhập sai PIN (${record.count}/${MAX_PIN_ATTEMPTS})`, 'warn');
                            }
                            conn.close();
                            return;
                        }

                        // PIN đúng -> Reset attempts và global failure counters
                        pinAttemptsMap.delete(remotePeerId);
                        globalFailCount = 0;
                        globalLockUntil = 0;

                        conn.send({ type: 'auth_result', ok: true });
                        conn.send({ type: 'session_info', totalFiles: fileQueue.length });
                        showStatus('senderStatus', `✅ Xác thực thành công — bắt đầu gửi ${fileQueue.length} file…`, 'ok');
                        sendAllFiles(conn);
                    }
                });

                conn.on('error', err => showStatus('senderStatus', '❌ ' + err.message, 'err'));
            });
        }

        // ── GỬI TUẦN TỰ TẤT CẢ FILE (STREAMING) ───────────────────────────
        async function sendAllFiles(conn) {
            isSending = true;
            renderQueue();

            adaptiveChunk.size = 64 * 1024;
            speedMeter.bytes = 0;
            speedMeter.windowStart = Date.now();
            speedMeter.lastKBps = 0;

            const pin = $('senderPin').value.trim();
            const totalBytes = fileQueue.reduce((s, f) => s + f.size, 0);
            let bytesSentTotal = 0;

            for (let i = 0; i < fileQueue.length; i++) {
                const qf = fileQueue[i];
                qf.status = 'sending';
                renderQueue();

                try {
                    await sendOneFile(conn, qf, i, (bytesSent) => {
                        const overall = Math.round((bytesSentTotal + bytesSent) / totalBytes * 100);
                        const speedTxt = speedMeter.lastKBps > 0
                            ? ` · ${speedMeter.lastKBps} KB/s · chunk ${adaptiveChunk.size / 1024 | 0}KB`
                            : '';
                        setProgress('senderProgressWrap', 'senderProgressBar', 'senderProgressLabel',
                            'senderChunkInfo', overall,
                            `📤 File ${i + 1}/${fileQueue.length}: ${qf.name}`,
                            `${formatBytes(bytesSentTotal + bytesSent)} / ${formatBytes(totalBytes)}${speedTxt}`
                        );
                    }, pin);

                    qf.status = 'done';
                    bytesSentTotal += qf.size;
                } catch (err) {
                    qf.status = 'error';
                    showStatus('senderStatus', `❌ Gửi file thất bại: ${qf.name}`, 'err');
                }
                renderQueue();
            }

            conn.send({ type: 'all_done' });
            isSending = false;
            clearAESKeyCache();
            setProgress('senderProgressWrap', 'senderProgressBar', 'senderProgressLabel',
                'senderChunkInfo', 100,
                `✅ Đã gửi ${fileQueue.length} file`,
                `Tổng: ${formatBytes(totalBytes)}`, true
            );
            showStatus('senderStatus', `✅ Gửi xong tất cả ${fileQueue.length} file!`, 'ok');
            renderQueue();
        }

        // ── GỬI MỘT FILE (STREAMING & BACKPRESSURE) ────────────────────────
        function sendOneFile(conn, qf, fileIndex, onProgress, pin) {
            return new Promise((resolve, reject) => {
                const file = qf.file;
                adaptiveChunk.size = 64 * 1024;
                speedMeter.bytes = 0;
                speedMeter.windowStart = Date.now();

                const totalChunks = Math.ceil(file.size / adaptiveChunk.size);
                const saltHex = generateRandomChallenge(); // Sinh Salt động cho file này

                conn.send({
                    type: 'file_header',
                    fileName: qf.name,
                    fileSize: file.size,
                    totalChunks,
                    fileIndex,
                    encrypted: true,
                    salt: saltHex,
                });

                let offset = 0;
                let bytesSent = 0;
                let chunkIndex = 0;

                const dc = conn._dc || conn.dataChannel || null;

                function adjustChunkSize() {
                    if (!dc) return;
                    const buffered = dc.bufferedAmount;
                    if (buffered > BUFFER_HIGH) {
                        adaptiveChunk.size = Math.max(adaptiveChunk.min, Math.round(adaptiveChunk.size * 0.5));
                    } else if (buffered < BUFFER_LOW) {
                        adaptiveChunk.size = Math.min(adaptiveChunk.max, adaptiveChunk.size + adaptiveChunk.step);
                    }
                }

                function updateSpeedMeter(justSentBytes) {
                    speedMeter.bytes += justSentBytes;
                    const now = Date.now();
                    const elapsed = now - speedMeter.windowStart;
                    if (elapsed >= 500) {
                        speedMeter.lastKBps = Math.round(speedMeter.bytes / elapsed);
                        speedMeter.bytes = 0;
                        speedMeter.windowStart = now;
                        const chunkEl = $('senderChunkInfo');
                        if (chunkEl) {
                            chunkEl.textContent =
                                `${speedMeter.lastKBps} KB/s · chunk ${adaptiveChunk.size / 1024 | 0}KB · 🔐 AES-GCM`;
                        }
                    }
                }

                async function sendNext() {
                    try {
                        while (offset < file.size) {
                            // Cơ chế Backpressure: Nếu buffer đầy, tạm dừng và đợi sự kiện low threshold
                            if (dc && dc.bufferedAmount > BUFFER_HIGH) {
                                dc.bufferedAmountLowThreshold = BUFFER_LOW;
                                dc.onbufferedamountlow = () => {
                                    dc.onbufferedamountlow = null;
                                    adjustChunkSize();
                                    sendNext(); // Tiếp tục vòng lặp
                                };
                                return; // Thoát khỏi hàm để tạm dừng vòng lặp
                            }

                            adjustChunkSize();

                            const end = Math.min(offset + adaptiveChunk.size, file.size);
                            const slice = file.slice(offset, end);
                            const plainChunk = await slice.arrayBuffer(); // Đọc dung lượng nhỏ vào RAM
                            const chunkBytes = end - offset;

                            // Mã hóa chunk qua AES-GCM với muối động
                            const encryptedChunk = await encryptChunk(pin, plainChunk, saltHex);

                            conn.send({ type: 'file_chunk', index: chunkIndex, data: encryptedChunk });

                            offset += chunkBytes;
                            bytesSent += chunkBytes;
                            chunkIndex += 1;
                            onProgress(bytesSent);
                            updateSpeedMeter(chunkBytes);
                        }

                        // File gửi hoàn tất
                        conn.send({ type: 'file_done', fileIndex });
                        onProgress(file.size);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                }

                sendNext();
            });
        }

        // ── RECEIVER: NÚT KẾT NỐI ────────────────────────────────────────
        $('connectBtn').addEventListener('click', async () => {
            const targetId = $('targetPeerId').value.trim();
            if (!targetId) { showStatus('receiverStatus', '⚠️ Nhập Peer ID người gửi!', 'warn'); return; }
            const pin = $('receiverPin').value.trim();
            if (!pin) { showStatus('receiverStatus', '⚠️ Nhập mã PIN!', 'warn'); return; }

            if (Date.now() < pinLockUntil) {
                const wait = Math.ceil((pinLockUntil - Date.now()) / 1000);
                showStatus('receiverStatus', `🔒 Tạm khoá ${wait}s`, 'err');
                return;
            }

            showStatus('receiverStatus', '⏳ Đang kết nối…', 'warn');

            recvFiles = [];
            recvTotalBytes = 0;
            recvExpectedTotal = 0;
            currentRecvFile = null;
            _chunkQueue = Promise.resolve();
            $('recvQueue').style.display = 'none';
            $('recvList').innerHTML = '';

            // Dùng thực thể peer chung duy nhất
            receiverConn = peer.connect(targetId, { reliable: true });

            receiverConn.on('open', async () => {
                showStatus('receiverStatus', '🔐 Đang kết nối xác thực…', 'warn');
                // Chờ Sender gửi thử thách (challenge) qua gói tin 'auth_challenge'
            });

            receiverConn.on('data', async msg => {
                // Nhận challenge từ Sender
                if (msg.type === 'auth_challenge') {
                    showStatus('receiverStatus', '🔐 Đang xác thực PIN…', 'warn');
                    try {
                        const response = await computeChallengeResponse(pin, msg.challenge);
                        receiverConn.send({ type: 'auth_response', response });
                    } catch (e) {
                        showStatus('receiverStatus', '❌ Lỗi xử lý xác thực.', 'err');
                        receiverConn.close();
                    }
                }

                // PIN Verification Result
                else if (msg.type === 'auth_result') {
                    if (!msg.ok) {
                        pinAttempts++;
                        if (pinAttempts >= MAX_PIN_ATTEMPTS) {
                            pinLockUntil = Date.now() + PIN_LOCK_MS;
                            pinAttempts = 0;
                            showStatus('receiverStatus', `🔒 Khoá 30s do sai PIN ${MAX_PIN_ATTEMPTS} lần`, 'err');
                        } else {
                            showStatus('receiverStatus', `🚫 ${msg.reason}`, 'err');
                        }
                        receiverConn.close();
                        return;
                    }
                    pinAttempts = 0;
                    showStatus('receiverStatus', '✅ Xác thực thành công — đang chờ file…', 'ok');
                }

                // Session metadata
                else if (msg.type === 'session_info') {
                    recvExpectedTotal = 0;
                    showStatus('receiverStatus', `📦 Sẽ nhận ${msg.totalFiles} file`, 'ok');
                }

                // File Header (nhận salt động)
                else if (msg.type === 'file_header') {
                    currentRecvFile = {
                        chunks: [],
                        receivedBytes: 0,
                        expectedSize: msg.fileSize,
                        name: msg.fileName,
                        totalChunks: msg.totalChunks,
                        fileIndex: msg.fileIndex,
                        encrypted: msg.encrypted === true,
                        salt: msg.salt,
                    };
                    recvExpectedTotal += msg.fileSize;

                    recvFiles.push({ name: msg.fileName, size: msg.fileSize, status: 'receiving' });
                    renderRecvList();
                    showStatus('receiverStatus', `📥 Đang nhận file ${msg.fileIndex + 1}: ${msg.fileName}`, 'ok');
                }

                // File Chunk
                else if (msg.type === 'file_chunk') {
                    if (!currentRecvFile) return;
                    const targetFile = currentRecvFile;
                    const rawData = msg.data;
                    const isEncrypted = targetFile.encrypted;
                    const pinVal = $('receiverPin').value.trim();
                    const saltVal = targetFile.salt;

                    enqueueChunk(async () => {
                        let chunkData = rawData;
                        if (isEncrypted) {
                            try {
                                chunkData = await decryptChunk(pinVal, rawData, saltVal);
                            } catch (err) {
                                showStatus('receiverStatus', '❌ Giải mã thất bại — sai PIN hoặc dữ liệu lỗi', 'err');
                                return;
                            }
                        }

                        targetFile.chunks.push(chunkData);
                        targetFile.receivedBytes += chunkData.byteLength;
                        recvTotalBytes += chunkData.byteLength;

                        const overallPct = recvExpectedTotal > 0
                            ? Math.round(recvTotalBytes / recvExpectedTotal * 100)
                            : 0;
                        setProgress('receiverProgressWrap', 'receiverProgressBar', 'receiverProgressLabel',
                            'receiverChunkInfo', overallPct,
                            `📥 File ${targetFile.fileIndex + 1}: ${targetFile.name}`,
                            `${formatBytes(recvTotalBytes)} / ${formatBytes(recvExpectedTotal)}`
                        );
                    });
                }

                // File Done
                else if (msg.type === 'file_done') {
                    if (!currentRecvFile) return;
                    const cf = currentRecvFile;
                    currentRecvFile = null;

                    enqueueChunk(async () => {
                        const blob = new Blob(cf.chunks);
                        const fileInfo = recvFiles[cf.fileIndex];

                        fileInfo.status = 'ok';
                        renderRecvList();

                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = cf.name;
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        showStatus('receiverStatus', `✅ Đã tải: ${cf.name}`, 'ok');
                    });
                }

                // Session Done
                else if (msg.type === 'all_done') {
                    clearAESKeyCache();
                    const ok = recvFiles.filter(f => f.status === 'ok').length;
                    const err = recvFiles.filter(f => f.status === 'err').length;
                    setProgress('receiverProgressWrap', 'receiverProgressBar', 'receiverProgressLabel',
                        'receiverChunkInfo', 100,
                        `✅ Nhận xong ${ok} file${err > 0 ? ` (${err} lỗi)` : ''}`,
                        formatBytes(recvTotalBytes), true
                    );
                    const msg2 = err > 0
                        ? `⚠️ Nhận xong: ${ok} file thành công, ${err} file lỗi`
                        : `✅ Đã nhận và tải xuống tất cả ${ok} file!`;
                    showStatus('receiverStatus', msg2, err > 0 ? 'warn' : 'ok');
                }
            });

            receiverConn.on('error', err => showStatus('receiverStatus', '❌ ' + err.message, 'err'));
        });

        // ── RENDER DANH SÁCH FILE RECEIVER ───────────────────────────────
        function renderRecvList() {
            const wrap = $('recvQueue');
            const list = $('recvList');
            const sumEl = $('recvSummary');

            if (recvFiles.length === 0) { wrap.style.display = 'none'; return; }
            wrap.style.display = 'block';

            const ok = recvFiles.filter(f => f.status === 'ok').length;
            sumEl.textContent = `${recvFiles.length} file · ${ok} đã tải`;

            list.innerHTML = '';
            recvFiles.forEach((f, i) => {
                const el = document.createElement('div');
                el.className = `recv-item ${f.status === 'ok' ? 'verified' : f.status === 'err' ? 'bad' : 'receiving'}`;
                el.id = `ri-${i}`;
                const safeName = escapeHtml(f.name);
                el.innerHTML = `
            <span style="font-size:0.9rem">${f.status === 'ok' ? '✅' : f.status === 'err' ? '❌' : '📥'}</span>
            <span class="r-name" title="${safeName}">${safeName}</span>
            <span class="r-size">${formatBytes(f.size)}</span>
            <span class="r-badge ${f.status === 'ok' ? 'ok' : f.status === 'err' ? 'err' : 'cur'}">
                ${f.status === 'ok' ? 'Đã tải' : f.status === 'err' ? 'Lỗi' : 'Đang nhận'}
            </span>
        `;
                list.appendChild(el);
            });
        }

        // Cập nhật mini progress bar cho từng file phía nhận
        function updateRecvItemBar(i, pct) {
            const bar = $(`rbar-${i}`);
            if (bar) bar.style.width = pct + '%';
        }

        // Khởi chạy
        initPeer();

        // ── UI/UX ENHANCEMENTS (DARK MODE & TOASTS) ──────────────────────

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = 'toast-item';
            
            let icon = '💡';
            if (type === 'success') icon = '✅';
            if (type === 'error') icon = '❌';
            if (type === 'warn') icon = '⚠️';

            toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
            
            container.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('hide');
                toast.addEventListener('animationend', () => {
                    toast.remove();
                });
            }, 3000);
        }

        // Dark Mode Logic
        window.toggleDarkMode = function() {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateDarkModeUI(isDark);
        }

        function updateDarkModeUI(isDark) {
            const icon = document.getElementById('darkmode-icon');
            const text = document.getElementById('darkmode-text');
            if (icon && text) {
                icon.innerText = isDark ? '☀️' : '🌙';
                text.innerText = isDark ? 'Chế độ sáng' : 'Chế độ tối';
            }
        }

        // Khởi tạo Dark mode từ localStorage
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-mode');
                updateDarkModeUI(true);
            }
        });
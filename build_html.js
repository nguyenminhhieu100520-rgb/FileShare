const fs = require('fs');
const path = require('path');

let html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');

// 1. Add Sidebar CSS
const sidebarCss = `
        /* -- NEW SIDEBAR LAYOUT -- */
        .app-container {
            display: flex;
            width: 100vw;
            min-height: 100vh;
        }
        .sidebar {
            width: 250px;
            background: var(--surface);
            border-right: 1px solid var(--border);
            padding: 20px 0;
            display: flex;
            flex-direction: column;
            z-index: 10;
        }
        .sidebar .brand {
            padding: 0 20px 20px;
            font-size: 1.2rem;
            font-weight: bold;
            border-bottom: 1px solid var(--border);
            margin-bottom: 10px;
        }
        .sidebar .menu-item {
            padding: 12px 20px;
            cursor: pointer;
            color: var(--text-muted);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .sidebar .menu-item:hover, .sidebar .menu-item.active {
            background: var(--surface2);
            color: var(--blue);
            border-right: 3px solid var(--blue);
        }
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
            overflow-y: auto;
            position: relative;
        }
        /* -- CHAT VIEW -- */
        .chat-container {
            width: 100%;
            max-width: 880px;
            display: flex;
            height: calc(100vh - 60px);
            gap: 20px;
        }
        .friends-list {
            width: 250px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            flex-shrink: 0;
        }
        .friends-header {
            padding: 15px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }
        .friend-item {
            padding: 12px 15px;
            border-bottom: 1px solid var(--border);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .friend-item:hover, .friend-item.active {
            background: var(--surface2);
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--text-muted);
        }
        .status-dot.online {
            background: var(--green);
        }
        .chat-window {
            flex: 1;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .chat-header {
            padding: 15px;
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }
        .chat-messages {
            flex: 1;
            padding: 15px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .msg {
            max-width: 70%;
            padding: 10px 14px;
            border-radius: 16px;
            font-size: 0.9rem;
            line-height: 1.4;
            word-wrap: break-word;
        }
        .msg.sent {
            align-self: flex-end;
            background: var(--blue-dim);
            color: white;
            border-bottom-right-radius: 4px;
        }
        .msg.recv {
            align-self: flex-start;
            background: var(--surface2);
            color: var(--text);
            border-bottom-left-radius: 4px;
        }
        .chat-input {
            padding: 15px;
            border-top: 1px solid var(--border);
            display: flex;
            gap: 10px;
        }
        .auth-container {
            max-width: 400px;
            margin: 50px auto;
            background: var(--surface);
            padding: 30px;
            border-radius: var(--radius);
            border: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
`;

// Insert CSS
html = html.replace('</style>', sidebarCss + '\n</style>');

// Modify Body structure
const bodyRegex = /<body[^>]*>([\s\S]*?)<script src="https:\/\/cdnjs.cloudflare.com/g;
let bodyContentMatch = html.match(/<body[^>]*>([\s\S]*?)<script src="https:\/\/cdnjs.cloudflare.com/);
let originalBody = bodyContentMatch[1];

// Remove the global padding and flex styling from body
html = html.replace(`body {
            font-family: 'Sora', sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px 20px;
        }`, `body {
            font-family: 'Sora', sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            overflow-x: hidden;
        }`);

const newBodyContent = `
    <div class="app-container">
        <div class="sidebar">
            <div class="brand">☁️ FileShare Pro</div>
            <div class="menu-item active" id="menu-file" onclick="switchTab('file')">
                <span style="font-size:1.2rem">📁</span> Truyền File P2P
            </div>
            <div class="menu-item" id="menu-chat" onclick="switchTab('chat')">
                <span style="font-size:1.2rem">💬</span> Chat & Bạn Bè
            </div>
        </div>
        <div class="main-content">
            <!-- P2P FILE TRANSFER VIEW -->
            <div id="view-file" style="display:block; width:100%; display:flex; flex-direction:column; align-items:center;">
                ${originalBody}
            </div>

            <!-- CHAT VIEW -->
            <div id="view-chat" style="display:none; width:100%; height:100%;">
                <!-- Auth Section -->
                <div id="authSection" class="auth-container">
                    <h2 id="authTitle" style="text-align:center">Đăng Nhập</h2>
                    <input type="text" id="authUsername" class="pin-input" placeholder="Tên đăng nhập" style="letter-spacing:normal">
                    <input type="password" id="authPassword" class="pin-input" placeholder="Mật khẩu" style="letter-spacing:normal" onkeypress="if(event.key==='Enter') handleAuth()">
                    <button class="btn btn-primary" onclick="handleAuth()">Xác Nhận</button>
                    <div style="text-align:center; font-size:0.85rem; color:var(--text-muted); cursor:pointer" onclick="toggleAuthMode()">
                        <span id="authToggleText">Chưa có tài khoản? Đăng ký ngay</span>
                    </div>
                    <div id="authError" style="color:var(--red); font-size:0.85rem; text-align:center; display:none"></div>
                </div>

                <!-- Chat Section (Hidden until logged in) -->
                <div id="chatSection" class="chat-container" style="display:none; margin: 0 auto;">
                    <div class="friends-list">
                        <div class="friends-header">
                            <div>Tài khoản của bạn</div>
                            <div style="font-size:0.85rem; color:var(--blue); margin-top:6px; font-family:'JetBrains Mono', monospace;" id="myAccountId"></div>
                        </div>
                        <div style="padding:15px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px">
                            <span style="font-size:0.8rem; color:var(--text-muted)">Thêm bạn bè bằng ID:</span>
                            <div style="display:flex; gap:5px">
                                <input type="text" id="addFriendId" class="pin-input" placeholder="Nhập ID" style="padding:8px 10px; font-size:0.85rem; letter-spacing:normal; flex:1">
                                <button class="btn btn-primary btn-sm" onclick="addFriend()">Thêm</button>
                            </div>
                        </div>
                        <div id="friendsListContainer" style="overflow-y:auto; flex:1">
                            <!-- Friends will be injected here -->
                        </div>
                        <div style="padding:15px; text-align:center; border-top:1px solid var(--border)">
                            <button class="btn btn-sm" style="background:var(--surface2); color:var(--text)" onclick="logout()">Đăng xuất</button>
                        </div>
                    </div>
                    
                    <div class="chat-window">
                        <div class="chat-header" id="chatHeader" style="display:flex; align-items:center; gap:10px">
                            <span>💬 Chọn một người bạn để bắt đầu chat</span>
                        </div>
                        <div class="chat-messages" id="chatMessages">
                            <!-- Messages -->
                        </div>
                        <div class="chat-input" id="chatInputArea" style="visibility:hidden">
                            <input type="text" id="chatInput" class="pin-input" placeholder="Nhập tin nhắn..." style="letter-spacing:normal; flex:1" onkeypress="if(event.key==='Enter') sendMessage()">
                            <button class="btn btn-primary btn-sm" onclick="sendMessage()" style="padding:0 20px">Gửi</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        // -- APP LOGIC (Tabs & Chat) --
        function switchTab(tab) {
            document.getElementById('view-file').style.display = tab === 'file' ? 'flex' : 'none';
            document.getElementById('view-chat').style.display = tab === 'chat' ? 'block' : 'none';
            document.getElementById('menu-file').classList.toggle('active', tab === 'file');
            document.getElementById('menu-chat').classList.toggle('active', tab === 'chat');
            if (tab === 'chat' && !isLoggedIn) {
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
                    checkAuth();
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
                    
                    document.getElementById('myAccountId').innerHTML = \`ID: \${currentUser.id} <button onclick="navigator.clipboard.writeText('\${currentUser.id}');alert('Đã copy ID')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding-left:10px" title="Copy">📋</button>\`;
                    initSocket();
                    loadFriends();
                } else {
                    isLoggedIn = false;
                    document.getElementById('authSection').style.display = 'flex';
                    document.getElementById('chatSection').style.display = 'none';
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function logout() {
            await fetch('/api/auth/logout', { method: 'POST' });
            if (socket) socket.disconnect();
            socket = null;
            checkAuth();
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
            if (data.error) alert(data.error);
            else {
                alert('Thêm bạn bè thành công!');
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
                const div = document.createElement('div');
                div.className = 'friend-item' + (activeFriendId === f.id ? ' active' : '');
                div.innerHTML = \`
                    <div class="status-dot \${f.status === 'online' ? 'online' : ''}" id="status-\${f.id}"></div>
                    <div>
                        <div style="font-weight:600">\${f.username}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">\${f.id}</div>
                    </div>
                \`;
                div.onclick = () => selectFriend(f);
                container.appendChild(div);
            });
        }

        function selectFriend(f) {
            activeFriendId = f.id;
            document.getElementById('chatHeader').innerHTML = \`
                <div class="status-dot \${f.status === 'online' ? 'online' : ''}" id="header-status-\${f.id}"></div>
                <span>Chat với <strong>\${f.username}</strong></span>
            \`;
            document.getElementById('chatInputArea').style.visibility = 'visible';
            loadFriends(); // update active class
            loadMessages(f.id);
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

    </script>
    <script src="https://cdnjs.cloudflare.com/`;

html = html.replace(/<body[^>]*>([\s\S]*?)<script src="https:\/\/cdnjs.cloudflare.com/, newBodyContent);

fs.writeFileSync(path.join(__dirname, 'public/index.html'), html);
console.log('Successfully built index.html');

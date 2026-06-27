// -- APP LOGIC (Tabs & Chat) --
        function toggleSidebar() {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
            }
        }

        function switchTab(tab) {
            document.getElementById('view-home').style.display = tab === 'home' ? 'flex' : 'none';
            document.getElementById('view-file').style.display = tab === 'file' ? 'flex' : 'none';
            document.getElementById('view-chat').style.display = tab === 'chat' ? 'block' : 'none';
            document.getElementById('view-profile').style.display = tab === 'profile' ? 'block' : 'none';
            document.getElementById('view-notifications').style.display = tab === 'notifications' ? 'block' : 'none';
            document.getElementById('view-history').style.display = tab === 'history' ? 'block' : 'none';
            document.getElementById('menu-home').classList.toggle('active', tab === 'home');
            document.getElementById('menu-file').classList.toggle('active', tab === 'file');
            document.getElementById('menu-chat').classList.toggle('active', tab === 'chat');
            document.getElementById('menu-profile').classList.toggle('active', tab === 'profile');
            document.getElementById('menu-notifications').classList.toggle('active', tab === 'notifications');
            document.getElementById('menu-history').classList.toggle('active', tab === 'history');
            if ((tab === 'chat' || tab === 'profile' || tab === 'notifications' || tab === 'history') && !isLoggedIn) {
                checkAuth();
            }
            if (tab === 'history' && isLoggedIn) {
                fetchTransferHistory();
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
                    document.getElementById('menu-notifications').style.display = 'flex';
                    document.getElementById('menu-history').style.display = 'flex';
                    
                    document.getElementById('myAccountId').innerHTML = `ID: ${currentUser.id} <button onclick="navigator.clipboard.writeText('${currentUser.id}');showToast('Đã copy ID', 'success')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding-left:10px" title="Copy">📋</button>`;
                    
                    document.getElementById('profileUsername').value = currentUser.username;
                    document.getElementById('profileId').value = currentUser.id;
                    document.getElementById('profileNickname').value = currentUser.nickname || '';
                    document.getElementById('myDisplayName').innerText = currentUser.nickname || currentUser.username;

                    initSocket();
                    loadFriends();
                    loadFriendRequests();
                } else {
                    isLoggedIn = false;
                    document.getElementById('authSection').style.display = 'flex';
                    document.getElementById('chatSection').style.display = 'none';
                    document.getElementById('menu-profile').style.display = 'none';
                    document.getElementById('menu-notifications').style.display = 'none';
                    document.getElementById('menu-history').style.display = 'none';
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
            document.getElementById('menu-notifications').style.display = 'none';
            document.getElementById('menu-history').style.display = 'none';
            document.getElementById('notificationBadge').style.display = 'none';
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
                showToast('Đã gửi lời mời kết bạn!', 'success');
                document.getElementById('addFriendId').value = '';
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
            if (socket) socket.emit('mark_all_read', { friendId: f.id });
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
            
            // Lưu trữ tin nhắn để dễ lookup khi reply
            window.messageCache = window.messageCache || {};
            
            data.messages.forEach(m => {
                window.messageCache[m.id] = m;
                appendMessage(m);
            });
            container.scrollTop = container.scrollHeight;
        }

        function appendMessage(m) {
            // Cache lại tin nhắn
            window.messageCache = window.messageCache || {};
            window.messageCache[m.id] = m;

            if ((m.senderId === activeFriendId && m.targetId === currentUser.id) ||
                (m.senderId === currentUser.id && m.targetId === activeFriendId)) {
                const container = document.getElementById('chatMessages');
                
                const existingWrapper = document.getElementById('msg-wrapper-' + m.id);
                if (existingWrapper) {
                    const statusSpan = existingWrapper.querySelector('.msg-status');
                    if (statusSpan && m.senderId === currentUser.id && !m.isDeleted) {
                        statusSpan.innerText = m.status === 'read' ? '✓✓' : (m.status === 'delivered' ? '✓✓' : '✓');
                        if (m.status === 'read') statusSpan.classList.add('read');
                    }
                    return;
                }

                const wrapper = document.createElement('div');
                wrapper.className = 'msg-wrapper';
                wrapper.id = 'msg-wrapper-' + m.id;
                // Align wrapper based on sender
                wrapper.style.alignSelf = (m.senderId === currentUser.id) ? 'flex-end' : 'flex-start';
                
                // Khối tin nhắn
                const div = document.createElement('div');
                div.className = 'msg ' + (m.senderId === currentUser.id ? 'sent' : 'recv');
                div.id = 'msg-' + m.id;

                if (m.isDeleted) {
                    div.classList.add('deleted');
                    div.innerHTML = `<em>Tin nhắn đã được thu hồi</em>`;
                } else {
                    let timeStr = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    let statusHtml = '';
                    if (m.senderId === currentUser.id) {
                        let ticks = m.status === 'read' ? '✓✓' : (m.status === 'delivered' ? '✓✓' : '✓');
                        let readClass = m.status === 'read' ? 'read' : '';
                        statusHtml = `<span class="msg-status ${readClass}">${ticks}</span>`;
                    }
                    
                    let replyHtml = '';
                    if (m.replyTo && window.messageCache[m.replyTo]) {
                        const originalMsg = window.messageCache[m.replyTo];
                        const origText = originalMsg.isDeleted ? "Tin nhắn đã được thu hồi" : escapeHtml(originalMsg.content);
                        replyHtml = `<div class="msg-reply-block">${origText}</div>`;
                    }

                    let renderedContent = escapeHtml(m.content);
                    const inviteMatch = m.content.match(/^\[FILE_INVITE:(.+)\]$/);
                    if (inviteMatch) {
                        const targetPeer = escapeHtml(inviteMatch[1]);
                        renderedContent = `
                            <div style="background:var(--surface2); padding:10px; border-radius:8px; border:1px solid var(--border); margin-top:5px; text-align:center;">
                                <div style="font-size:0.9rem; margin-bottom:8px; color:var(--text-muted)">Mình muốn gửi file cho bạn!</div>
                                <button class="btn btn-primary btn-sm" onclick="acceptFileInvite('${targetPeer}')" style="width:100%; font-size:0.85rem;">
                                    📁 Nhận File (ID: ${targetPeer})
                                </button>
                            </div>
                        `;
                    }

                    div.innerHTML = `
                        ${replyHtml}
                        <div>${renderedContent}</div>
                        <div class="msg-meta">${timeStr} ${statusHtml}</div>
                    `;
                }

                wrapper.appendChild(div);

                // Khối nút thao tác (Chỉ hiện khi chưa xóa)
                if (!m.isDeleted) {
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'msg-actions';
                    
                    // Nút Trả lời cho tất cả tin nhắn
                    actionsDiv.innerHTML += `<button class="action-btn" onclick="setupReply('${m.id}', '${escapeHtml(m.content).replace(/'/g, "\\'")}')" title="Trả lời">↩️</button>`;
                    
                    // Nút Xóa chỉ cho tin nhắn của mình
                    if (m.senderId === currentUser.id) {
                        actionsDiv.innerHTML += `<button class="action-btn del-btn" onclick="deleteMessage('${m.id}')" title="Thu hồi">🗑️</button>`;
                    }
                    wrapper.appendChild(actionsDiv);
                }
                
                const typingInd = document.getElementById('typingIndicator');
                if (typingInd && typingInd.parentNode === container) {
                    container.insertBefore(wrapper, typingInd);
                } else {
                    container.appendChild(wrapper);
                }
                container.scrollTop = container.scrollHeight;
                
                if (m.senderId === activeFriendId && m.targetId === currentUser.id && socket && !m.isDeleted) {
                    socket.emit('mark_all_read', { friendId: activeFriendId });
                }
            }
        }

        let replyingToMessageId = null;

        window.setupReply = function(id, text) {
            replyingToMessageId = id;
            document.getElementById('replyPreview').style.display = 'flex';
            document.getElementById('replyPreviewText').innerText = text;
            document.getElementById('chatInput').focus();
        };

        window.cancelReply = function() {
            replyingToMessageId = null;
            document.getElementById('replyPreview').style.display = 'none';
        };

        window.deleteMessage = function(messageId) {
            if (confirm("Bạn có chắc muốn thu hồi tin nhắn này?")) {
                socket.emit('delete_message', { messageId });
            }
        };

        function sendMessage() {
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (!text || !activeFriendId || !socket) return;
            
            socket.emit('send_message', { 
                targetId: activeFriendId, 
                content: text,
                replyTo: replyingToMessageId 
            });
            input.value = '';
            cancelReply();
            document.getElementById('emojiPicker').style.display = 'none';
        }

        function sendInviteLink() {
            const peerId = document.getElementById('myPeerId').innerText;
            if (!peerId || peerId === 'Đang lấy ID...') {
                showToast('Chưa lấy được ID truyền file, vui lòng đợi!', 'warn');
                return;
            }
            if (!activeFriendId || !socket) return;
            
            const inviteMsg = `[FILE_INVITE:${peerId}]`;
            socket.emit('send_message', { 
                targetId: activeFriendId, 
                content: inviteMsg,
                replyTo: replyingToMessageId 
            });
            cancelReply();
        }

        window.acceptFileInvite = function(peerId) {
            switchTab('file');
            const targetInput = document.getElementById('targetPeerId');
            if (targetInput) {
                targetInput.value = peerId;
                targetInput.focus();
                
                const banner = document.getElementById('receiverBanner');
                if (banner) {
                    banner.style.display = 'flex';
                }
            }
        };

        // --- EMOJI PICKER LOGIC ---
        const EMOJIS = [
            // Smileys & Emotion
            '😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','👽','👾','🤖',
            // Gestures & Body Parts
            '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄','💋','🩸',
            // Symbols
            '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','✨','⭐','🌟','💫','🔥','🎉','🎊','🎈'
        ];
        
        window.toggleEmojiPicker = function() {
            const picker = document.getElementById('emojiPicker');
            if (picker.style.display === 'none') {
                picker.style.display = 'grid';
                if (picker.childElementCount === 0) {
                    picker.innerHTML = EMOJIS.map(e => `<span onclick="insertEmoji('${e}')">${e}</span>`).join('');
                }
            } else {
                picker.style.display = 'none';
            }
        };

        window.insertEmoji = function(emoji) {
            const input = document.getElementById('chatInput');
            input.value += emoji;
            input.focus();
        };

        document.getElementById('chatInput').addEventListener('input', () => {
            if (activeFriendId && socket) {
                socket.emit('typing', { targetId: activeFriendId });
            }
        });

        // --- FRIEND REQUEST LOGIC ---
        async function loadFriendRequests() {
            const res = await fetch('/api/friends/requests');
            const data = await res.json();
            const container = document.getElementById('notificationList');
            const badge = document.getElementById('notificationBadge');
            
            if (data.requests && data.requests.length > 0) {
                badge.style.display = 'block';
                badge.innerText = data.requests.length;
                container.innerHTML = '';
                data.requests.forEach(req => {
                    const displayName = req.nickname ? req.nickname : req.username;
                    const div = document.createElement('div');
                    div.className = 'notification-item';
                    div.innerHTML = `
                        <div>
                            <div style="font-weight:600">${displayName}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted)">ID: ${req.id}</div>
                        </div>
                        <div class="actions">
                            <button class="btn btn-primary btn-sm" onclick="acceptFriendRequest('${req.id}')">Đồng ý</button>
                            <button class="btn btn-sm" style="background:var(--surface); border:1px solid var(--border);" onclick="declineFriendRequest('${req.id}')">Từ chối</button>
                        </div>
                    `;
                    container.appendChild(div);
                });
            } else {
                badge.style.display = 'none';
                container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.9rem">Không có thông báo nào</div>';
            }
        }

        async function acceptFriendRequest(friendId) {
            const res = await fetch('/api/friends/accept', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({friendId})
            });
            const data = await res.json();
            if (data.error) {
                showToast(data.error, 'error');
            } else {
                showToast('Đã chấp nhận kết bạn!', 'success');
                loadFriendRequests();
                loadFriends();
            }
        }

        async function declineFriendRequest(friendId) {
            const res = await fetch('/api/friends/decline', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({friendId})
            });
            const data = await res.json();
            if (data.error) {
                showToast(data.error, 'error');
            } else {
                showToast('Đã từ chối lời mời.', 'ok');
                loadFriendRequests();
            }
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

            let typingHideTimer;
            socket.on('friend_typing', data => {
                if (data.senderId === activeFriendId) {
                    let typingInd = document.getElementById('typingIndicator');
                    if (!typingInd) {
                        typingInd = document.createElement('div');
                        typingInd.id = 'typingIndicator';
                        typingInd.className = 'typing-indicator';
                        typingInd.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
                    }
                    typingInd.style.display = 'flex';
                    const container = document.getElementById('chatMessages');
                    container.appendChild(typingInd);
                    container.scrollTop = container.scrollHeight;
                    
                    clearTimeout(typingHideTimer);
                    typingHideTimer = setTimeout(() => {
                        typingInd.style.display = 'none';
                    }, 2000);
                }
            });

            socket.on('message_status_update', data => {
                const msgDiv = document.getElementById('msg-' + data.messageId);
                if (msgDiv) {
                    const statusSpan = msgDiv.querySelector('.msg-status');
                    if (statusSpan) {
                        statusSpan.innerText = data.status === 'read' ? '✓✓' : (data.status === 'delivered' ? '✓✓' : '✓');
                        if (data.status === 'read') statusSpan.classList.add('read');
                    }
                }
            });

            socket.on('all_messages_read', data => {
                if (activeFriendId === data.targetId) {
                    document.querySelectorAll('.msg.sent .msg-status').forEach(span => {
                        span.innerText = '✓✓';
                        span.classList.add('read');
                    });
                }
            });

            socket.on('message_deleted', data => {
                const wrapper = document.getElementById('msg-wrapper-' + data.messageId);
                if (wrapper) {
                    const msgDiv = wrapper.querySelector('.msg');
                    if (msgDiv) {
                        msgDiv.classList.add('deleted');
                        msgDiv.innerHTML = `<em>Tin nhắn đã được thu hồi</em>`;
                    }
                    const actionsDiv = wrapper.querySelector('.msg-actions');
                    if (actionsDiv) actionsDiv.remove(); // Xóa nút thao tác vì đã thu hồi
                }
                if (window.messageCache && window.messageCache[data.messageId]) {
                    window.messageCache[data.messageId].isDeleted = true;
                }
            });

            // Lời mời kết bạn
            socket.on('receive_friend_request', data => {
                const displayName = data.nickname || data.username;
                showToast(`Lời mời kết bạn từ ${displayName}`, 'ok');
                loadFriendRequests(); // Update UI
            });

            socket.on('friend_request_accepted', data => {
                showToast('Lời mời kết bạn đã được chấp nhận!', 'success');
                loadFriends();
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
        const recvSpeedMeter = {
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
        let lastTargetId = null;
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

        function formatSpeed(kbps) {
            if (kbps < 1024) return kbps + ' KB/s';
            return (kbps / 1024).toFixed(1) + ' MB/s';
        }

        function formatETA(seconds) {
            if (!isFinite(seconds) || seconds < 0) return '--:--';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
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

        async function calculateHash(blob) {
            const buffer = await blob.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        }

        // Sinh thách thức ngẫu nhiên bảo mật (challenge)
        function generateRandomChallenge() {
            const array = new Uint8Array(16);
            crypto.getRandomValues(array);
            return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
        }

        // ── SOUND NOTIFICATIONS ───────────────────────────────────────────
        function playTingSound() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.5);
            } catch(e) {}
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

        // ══════════════════════════════════════════════════════════════════
        //  CUSTOM MALWARE SCANNER MODULE (Lớp 4)
        // ══════════════════════════════════════════════════════════════════
        const CustomMalwareScanner = {
            // Danh sách đuôi file nguy hiểm (có thể chứa mã thực thi)
            dangerousExtensions: [
                '.exe', '.bat', '.cmd', '.com', '.vbs', '.vbe', '.jse',
                '.wsf', '.wsh', '.msi', '.msp', '.scr', '.cpl', '.hta',
                '.inf', '.reg', '.ps1', '.lnk', '.pif', '.dll', '.sys'
            ],

            // Chữ ký Magic Bytes của các định dạng file phổ biến
            magicSignatures: [
                { bytes: [0x4D, 0x5A], type: 'exe', name: 'Windows Executable (MZ)' },
                { bytes: [0x7F, 0x45, 0x4C, 0x46], type: 'elf', name: 'Linux Executable (ELF)' },
                { bytes: [0xFF, 0xD8, 0xFF], type: 'jpg', name: 'JPEG Image' },
                { bytes: [0x89, 0x50, 0x4E, 0x47], type: 'png', name: 'PNG Image' },
                { bytes: [0x47, 0x49, 0x46], type: 'gif', name: 'GIF Image' },
                { bytes: [0x25, 0x50, 0x44, 0x46], type: 'pdf', name: 'PDF Document' },
                { bytes: [0x50, 0x4B, 0x03, 0x04], type: 'zip', name: 'ZIP/Office Archive' },
                { bytes: [0x52, 0x61, 0x72, 0x21], type: 'rar', name: 'RAR Archive' },
                { bytes: [0x37, 0x7A, 0xBC, 0xAF], type: '7z', name: '7-Zip Archive' },
                { bytes: [0x1A, 0x45, 0xDF, 0xA3], type: 'webm', name: 'WebM/MKV Video' },
                { bytes: [0x49, 0x44, 0x33], type: 'mp3', name: 'MP3 Audio (ID3)' },
            ],

            // Ánh xạ đuôi file → loại Magic Bytes kỳ vọng
            extensionExpected: {
                '.jpg': ['jpg'], '.jpeg': ['jpg'], '.png': ['png'], '.gif': ['gif'],
                '.pdf': ['pdf'], '.zip': ['zip'], '.docx': ['zip'], '.xlsx': ['zip'],
                '.pptx': ['zip'], '.rar': ['rar'], '.7z': ['7z'], '.webm': ['webm'],
                '.mkv': ['webm'], '.mp3': ['mp3'],
            },

            // Chuỗi mẫu nguy hiểm trong file văn bản
            dangerousPatterns: [
                { re: /eval\s*\(\s*atob/gi, name: 'eval(atob()) — Thực thi mã ẩn Base64' },
                { re: /WScript\.Shell/gi, name: 'WScript.Shell — Shell Windows' },
                { re: /ActiveXObject/gi, name: 'ActiveXObject — Đối tượng COM' },
                { re: /powershell\s*[\-\/]e/gi, name: 'PowerShell encoded command' },
                { re: /cmd\s*\/[ck]/gi, name: 'CMD command execution' },
                { re: /document\.write\s*\(\s*unescape/gi, name: 'document.write(unescape()) — Obfuscated injection' },
                { re: /fromCharCode\s*\(/gi, name: 'String.fromCharCode — Obfuscation' },
                { re: /CreateObject/gi, name: 'CreateObject — VBS Object Creation' },
                { re: /Shell\.Application/gi, name: 'Shell.Application — Shell access' },
                { re: /HKEY_|RegWrite|RegRead/gi, name: 'Registry manipulation' },
                { re: /new\s+Function\s*\(/gi, name: 'new Function() — Dynamic code execution' },
                { re: /\.ShellExecute/gi, name: 'ShellExecute — Chạy chương trình' },
            ],

            // Ký tự Unicode dùng để giả mạo tên file
            spoofingChars: [
                '\u202E', '\u200F', '\u200E', '\u2066', '\u2067',
                '\u2068', '\u2069', '\u202A', '\u202B', '\u202C', '\u202D'
            ],

            // ── HÀM QUÉT CHÍNH ──
            async scan(blob, fileName) {
                const results = { safe: true, threats: [], details: [] };

                // 4a: Kiểm tra đuôi file
                const extResult = this._checkExtension(fileName);
                results.details.push(extResult);
                if (!extResult.safe) { results.safe = false; results.threats.push(extResult); }

                // 4b: Kiểm tra Magic Bytes
                const magicResult = await this._checkMagicBytes(blob, fileName);
                results.details.push(magicResult);
                if (!magicResult.safe) { results.safe = false; results.threats.push(magicResult); }

                // 4c: Kiểm tra Unicode ẩn trong tên file
                const unicodeResult = this._checkUnicode(fileName);
                results.details.push(unicodeResult);
                if (!unicodeResult.safe) { results.safe = false; results.threats.push(unicodeResult); }

                // 4d: Quét nội dung file văn bản (< 5MB)
                const contentResult = await this._checkContent(blob, fileName);
                results.details.push(contentResult);
                if (!contentResult.safe) { results.safe = false; results.threats.push(contentResult); }

                return results;
            },

            _checkExtension(fileName) {
                const ext = ('.' + fileName.split('.').pop()).toLowerCase();
                const parts = fileName.split('.');
                const hasDblExt = parts.length > 2 && this.dangerousExtensions.includes(('.' + parts[parts.length - 1]).toLowerCase());
                if (this.dangerousExtensions.includes(ext)) {
                    return { layer: '4a', name: 'Kiểm tra đuôi file', safe: false, message: `Đuôi "${ext}" là định dạng thực thi nguy hiểm` };
                }
                if (hasDblExt) {
                    return { layer: '4a', name: 'Kiểm tra đuôi file', safe: false, message: `Đuôi kép đáng ngờ: "${fileName}"` };
                }
                return { layer: '4a', name: 'Kiểm tra đuôi file', safe: true, message: `Đuôi "${ext}" an toàn` };
            },

            async _checkMagicBytes(blob, fileName) {
                const ext = ('.' + fileName.split('.').pop()).toLowerCase();
                const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
                const magicHex = Array.from(header.slice(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

                // Phát hiện loại file thực tế từ Magic Bytes
                let detected = null;
                for (const sig of this.magicSignatures) {
                    if (sig.bytes.every((b, i) => header[i] === b)) { detected = sig; break; }
                }

                // File thực thi giả mạo đuôi an toàn
                if (detected && (detected.type === 'exe' || detected.type === 'elf')) {
                    if (!this.dangerousExtensions.includes(ext)) {
                        return { layer: '4b', name: 'Kiểm tra Magic Bytes', safe: false, message: `GIẢ MẠO! Đuôi "${ext}" nhưng thực tế là ${detected.name}` };
                    }
                }

                // Đuôi file có Magic Bytes kỳ vọng nhưng không khớp
                const expected = this.extensionExpected[ext];
                if (expected && detected && !expected.includes(detected.type)) {
                    return { layer: '4b', name: 'Kiểm tra Magic Bytes', safe: false, message: `Magic Bytes không khớp! Đuôi "${ext}" nhưng nội dung là ${detected.name}` };
                }

                return { layer: '4b', name: 'Kiểm tra Magic Bytes', safe: true, message: `[${magicHex}] ${detected ? '→ ' + detected.name + ' — ' : ''}khớp đuôi file` };
            },

            _checkUnicode(fileName) {
                for (const ch of this.spoofingChars) {
                    if (fileName.includes(ch)) {
                        return { layer: '4c', name: 'Kiểm tra Unicode ẩn', safe: false, message: `Tên file chứa ký tự Unicode ẩn (U+${ch.codePointAt(0).toString(16).toUpperCase()}) dùng giả mạo tên!` };
                    }
                }
                return { layer: '4c', name: 'Kiểm tra Unicode ẩn', safe: true, message: 'Tên file sạch, không có Unicode ẩn' };
            },

            async _checkContent(blob, fileName) {
                const textExts = ['.txt', '.html', '.htm', '.js', '.css', '.json', '.xml', '.svg',
                    '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.wsf', '.hta', '.csv',
                    '.md', '.yml', '.yaml', '.ini', '.cfg', '.sh', '.py', '.php'];
                const ext = ('.' + fileName.split('.').pop()).toLowerCase();

                if (!textExts.includes(ext)) {
                    return { layer: '4d', name: 'Quét nội dung', safe: true, message: 'Không phải file văn bản — bỏ qua' };
                }
                if (blob.size > 5 * 1024 * 1024) {
                    return { layer: '4d', name: 'Quét nội dung', safe: true, message: 'File > 5MB — bỏ qua quét nội dung' };
                }

                try {
                    const text = await blob.text();
                    const found = [];
                    for (const { re, name } of this.dangerousPatterns) {
                        re.lastIndex = 0;
                        const m = text.match(re);
                        if (m && m.length > 0) found.push(`${name} (×${m.length})`);
                    }
                    if (found.length > 0) {
                        return { layer: '4d', name: 'Quét nội dung', safe: false, message: `Phát hiện ${found.length} mẫu nguy hiểm: ${found.join('; ')}` };
                    }
                    return { layer: '4d', name: 'Quét nội dung', safe: true, message: 'Không tìm thấy mẫu nguy hiểm' };
                } catch (e) {
                    return { layer: '4d', name: 'Quét nội dung', safe: true, message: 'Không đọc được nội dung (binary)' };
                }
            }
        };

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

                let iconHtml = `<span class="q-icon">${icons[f.status] || '📄'}</span>`;
                if (f.previewUrl) {
                    if (f.type.startsWith('image/')) {
                        iconHtml = `<img src="${f.previewUrl}" class="q-icon preview-img" alt="img" style="width:24px;height:24px;object-fit:cover;border-radius:4px;vertical-align:middle;">`;
                    } else if (f.type.startsWith('video/')) {
                        iconHtml = `<video src="${f.previewUrl}" class="q-icon preview-img" muted style="width:24px;height:24px;object-fit:cover;border-radius:4px;vertical-align:middle;"></video>`;
                    }
                }

                el.innerHTML = `
            ${iconHtml}
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
                    let previewUrl = null;
                    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                        previewUrl = URL.createObjectURL(file);
                    }
                    fileQueue.push({ file, name: file.name, size: file.size, type: file.type, previewUrl, status: 'pending' });
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
        let dragCounter = 0;
        window.addEventListener('dragenter', e => {
            if (isSending) return;
            e.preventDefault();
            dragCounter++;
            $('dragOverlay').classList.add('active');
        });
        window.addEventListener('dragleave', e => {
            if (isSending) return;
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) $('dragOverlay').classList.remove('active');
        });
        window.addEventListener('dragover', e => e.preventDefault());
        window.addEventListener('drop', e => {
            e.preventDefault();
            dragCounter = 0;
            $('dragOverlay').classList.remove('active');
            if (!isSending && e.dataTransfer.files.length > 0) addFilesToQueue(e.dataTransfer.files);
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
            const opts = { 
                host: cfg.peerHost, 
                port: cfg.peerPort, 
                path: cfg.peerPath, 
                secure: cfg.secure,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun.cloudflare.com:3478' },
                        {
                            urls: 'turn:openrelay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ]
                }
            };

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
                    } else if (msg.type === 'client_ready') {
                        showStatus('senderStatus', `✅ Bắt đầu truyền ${fileQueue.length} file…`, 'ok');
                        playTingSound();
                        sendAllFiles(conn);
                    } else if (msg.type === 'resume_request') {
                        showStatus('senderStatus', `✅ Khôi phục truyền từ file ${msg.fileIndex + 1}…`, 'ok');
                        playTingSound();
                        sendAllFiles(conn, msg.fileIndex, msg.receivedBytes);
                    }
                });

                conn.on('error', err => showStatus('senderStatus', '❌ ' + err.message, 'err'));
            });
        }

        // ── GỬI TUẦN TỰ TẤT CẢ FILE (STREAMING) ───────────────────────────
        async function sendAllFiles(conn, startFileIndex = 0, startOffset = 0) {
            isSending = true;
            renderQueue();

            adaptiveChunk.size = 64 * 1024;
            speedMeter.bytes = 0;
            speedMeter.windowStart = Date.now();
            speedMeter.lastKBps = 0;

            const pin = $('senderPin').value.trim();
            const totalBytes = fileQueue.reduce((s, f) => s + f.size, 0);
            let bytesSentTotal = 0;
            for (let i = 0; i < startFileIndex; i++) {
                bytesSentTotal += fileQueue[i].size;
            }

            $('senderStopBtn').style.display = 'inline-block';
            for (let i = startFileIndex; i < fileQueue.length; i++) {
                if (!isSending) break;
                const qf = fileQueue[i];
                qf.status = 'sending';
                renderQueue();
                const resumeOff = (i === startFileIndex) ? startOffset : 0;

                try {
                    await sendOneFile(conn, qf, i, (bytesSent) => {
                        const overall = Math.round((bytesSentTotal + bytesSent) / totalBytes * 100);
                        let speedTxt = '';
                        let etaTxt = '';
                        if (speedMeter.lastKBps > 0) {
                            const remainingBytes = totalBytes - (bytesSentTotal + bytesSent);
                            const remainingSecs = remainingBytes / (speedMeter.lastKBps * 1024);
                            speedTxt = ` · ${formatSpeed(speedMeter.lastKBps)}`;
                            etaTxt = ` · ⏳ ${formatETA(remainingSecs)}`;
                        }
                        setProgress('senderProgressWrap', 'senderProgressBar', 'senderProgressLabel',
                            'senderChunkInfo', overall,
                            `📤 File ${i + 1}/${fileQueue.length}: ${qf.name}`,
                            `${formatBytes(bytesSentTotal + bytesSent)} / ${formatBytes(totalBytes)}${speedTxt}${etaTxt}`
                        );
                    }, pin, resumeOff);

                    qf.status = 'done';
                    saveTransferHistory(conn.peer, qf.name, qf.size, 'sender', 'completed');
                    bytesSentTotal += qf.size;
                } catch (err) {
                    if (err.message === 'PAUSED') {
                        qf.status = 'paused';
                        showStatus('senderStatus', `⏸ Tạm ngưng gửi file do rớt mạng: ${qf.name}`, 'warn');
                        isSending = false;
                        renderQueue();
                        return; // Thoát vòng lặp, giữ nguyên hàng đợi
                    }
                    qf.status = 'error';
                    saveTransferHistory(conn.peer, qf.name, qf.size, 'sender', 'failed');
                    showStatus('senderStatus', `❌ Gửi file thất bại: ${qf.name}`, 'err');
                }
                renderQueue();
            }

            conn.send({ type: 'all_done' });
            isSending = false;
            clearAESKeyCache();
            playTingSound();
            setProgress('senderProgressWrap', 'senderProgressBar', 'senderProgressLabel',
                'senderChunkInfo', 100,
                `✅ Đã gửi ${fileQueue.length} file`,
                `Tổng: ${formatBytes(totalBytes)}`, true
            );
            showStatus('senderStatus', `✅ Gửi xong tất cả ${fileQueue.length} file!`, 'ok');
            $('senderStopBtn').style.display = 'none';
            renderQueue();
        }

        // ── GỬI MỘT FILE (STREAMING & BACKPRESSURE) ────────────────────────
        function sendOneFile(conn, qf, fileIndex, onProgress, pin, resumeOffset = 0) {
            return new Promise(async (resolve, reject) => {
                try {
                    const file = qf.file;
                    adaptiveChunk.size = 64 * 1024;
                    speedMeter.bytes = 0;
                    speedMeter.windowStart = Date.now();

                    if (!qf.originalHash) {
                        showStatus('senderStatus', `⏳ Đang quét mã Hash SHA-256 cho file ${qf.name}...`, 'warn');
                        qf.originalHash = await calculateHash(file);
                        showStatus('senderStatus', `✅ Bắt đầu gửi file ${qf.name}...`, 'ok');
                    }

                    const totalChunks = Math.ceil(file.size / adaptiveChunk.size);
                    const saltHex = generateRandomChallenge(); // Sinh Salt động cho file này

                    conn.send({
                        type: 'file_header',
                        fileName: qf.name,
                        fileSize: file.size,
                        fileType: qf.file.type,
                        totalChunks,
                        fileIndex,
                        encrypted: true,
                        salt: saltHex,
                        resumeOffset: resumeOffset,
                        originalHash: qf.originalHash
                    });

                    let offset = resumeOffset;
                    let bytesSent = resumeOffset;
                    let chunkIndex = Math.floor(resumeOffset / adaptiveChunk.size);

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
                            if (!conn.open) throw new Error('PAUSED');
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

                            // Lớp 2: Tính hash SHA-256 cho chunk trước khi mã hóa
                            const chunkHashBuf = await crypto.subtle.digest('SHA-256', plainChunk);
                            const chunkHash = Array.from(new Uint8Array(chunkHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

                            // Mã hóa chunk qua AES-GCM với muối động
                            const encryptedChunk = await encryptChunk(pin, plainChunk, saltHex);

                            // Gửi chunk mã hóa kèm hash để receiver xác thực từng chunk
                            conn.send({ type: 'file_chunk', index: chunkIndex, data: encryptedChunk, chunkHash });

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
                } catch (err) {
                    reject(err);
                }
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

            if (lastTargetId !== targetId || !currentRecvFile) {
                recvFiles = [];
                recvTotalBytes = 0;
                recvExpectedTotal = 0;
                currentRecvFile = null;
                _chunkQueue = Promise.resolve();
                $('recvQueue').style.display = 'none';
                $('recvList').innerHTML = '';
            }
            lastTargetId = targetId;

            // Dùng thực thể peer chung duy nhất (bỏ { reliable: true } vì P2P native SCTP đã reliable)
            receiverConn = peer.connect(targetId);

            const connTimeout = setTimeout(() => {
                if (receiverConn && !receiverConn.open) {
                    showStatus('receiverStatus', '❌ Lỗi mạng (Timeout): Tường lửa (Firewall) trên Laptop của người gửi có thể đang chặn kết nối đến. Vui lòng tắt Firewall, đổi mạng hoặc thử lại!', 'err');
                    receiverConn.close();
                }
            }, 15000);

            receiverConn.on('open', async () => {
                clearTimeout(connTimeout);
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
                    if (currentRecvFile) {
                        showStatus('receiverStatus', '✅ Xác thực thành công — đang yêu cầu tiếp tục truyền…', 'ok');
                        playTingSound();
                        receiverConn.send({ type: 'resume_request', fileIndex: currentRecvFile.fileIndex, receivedBytes: currentRecvFile.receivedBytes });
                    } else {
                        showStatus('receiverStatus', '✅ Xác thực thành công — đang chờ file…', 'ok');
                        playTingSound();
                    }
                }

                // Session metadata
                else if (msg.type === 'session_info') {
                    if (!currentRecvFile) {
                        recvExpectedTotal = 0;
                        recvSpeedMeter.bytes = 0;
                        recvSpeedMeter.windowStart = Date.now();
                        recvSpeedMeter.lastKBps = 0;
                        showStatus('receiverStatus', `🤝 Chấp nhận mã PIN. Bắt đầu nhận ${msg.totalFiles} file...`, 'ok');
                        $('receiverStopBtn').style.display = 'inline-block';
                        receiverConn.send({ type: 'client_ready' });
                    }
                }

                // File Header (nhận salt động)
                else if (msg.type === 'file_header') {
                    if (msg.resumeOffset && currentRecvFile && currentRecvFile.fileIndex === msg.fileIndex) {
                        currentRecvFile.salt = msg.salt; // cập nhật salt mới
                        showStatus('receiverStatus', `📥 Tiếp tục nhận file ${msg.fileIndex + 1}: ${msg.fileName}`, 'ok');
                        return;
                    }
                    currentRecvFile = {
                        chunks: [],
                        receivedBytes: 0,
                        expectedSize: msg.fileSize,
                        name: msg.fileName,
                        type: msg.fileType || '',
                        totalChunks: msg.totalChunks,
                        fileIndex: msg.fileIndex,
                        encrypted: msg.encrypted === true,
                        salt: msg.salt,
                        originalHash: msg.originalHash
                    };
                    recvExpectedTotal += msg.fileSize;

                    recvFiles.push({ name: msg.fileName, size: msg.fileSize, type: msg.fileType || '', previewUrl: null, status: 'receiving' });
                    renderRecvList();
                    showStatus('receiverStatus', `📥 Đang nhận file ${msg.fileIndex + 1}: ${msg.fileName}`, 'ok');
                }

                // File Chunk
                else if (msg.type === 'file_chunk') {
                    if (!currentRecvFile) return;
                    const targetFile = currentRecvFile;
                    const rawData = msg.data;
                    const receivedChunkHash = msg.chunkHash;
                    const chunkIdx = msg.index;
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

                        // ── LỚP 2: XÁC THỰC HASH TỪNG CHUNK ──
                        if (receivedChunkHash) {
                            const verifyBuf = await crypto.subtle.digest('SHA-256', chunkData);
                            const verifyHash = Array.from(new Uint8Array(verifyBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                            if (verifyHash !== receivedChunkHash) {
                                showStatus('receiverStatus', `🚨 CHUNK #${chunkIdx} BỊ SỬA ĐỔI! Hash không khớp — Đang hủy file...`, 'err');
                                targetFile.chunks = [];
                                targetFile.receivedBytes = 0;
                                currentRecvFile = null;
                                if (receiverConn) receiverConn.close();
                                playTingSound();
                                return;
                            }
                        }

                        targetFile.chunks[chunkIdx] = chunkData;
                        targetFile.receivedBytes += chunkData.byteLength;
                        recvTotalBytes += chunkData.byteLength;

                        recvSpeedMeter.bytes += chunkData.byteLength;
                        const now = Date.now();
                        const elapsed = now - recvSpeedMeter.windowStart;
                        if (elapsed >= 500) {
                            recvSpeedMeter.lastKBps = Math.round(recvSpeedMeter.bytes / elapsed);
                            recvSpeedMeter.bytes = 0;
                            recvSpeedMeter.windowStart = now;
                        }
                        
                        let speedTxt = '';
                        let etaTxt = '';
                        if (recvSpeedMeter.lastKBps > 0) {
                            const remainingBytes = recvExpectedTotal - recvTotalBytes;
                            const remainingSecs = remainingBytes / (recvSpeedMeter.lastKBps * 1024);
                            speedTxt = ` · ${formatSpeed(recvSpeedMeter.lastKBps)}`;
                            etaTxt = ` · ⏳ ${formatETA(remainingSecs)}`;
                        }

                        const overallPct = recvExpectedTotal > 0
                            ? Math.round(recvTotalBytes / recvExpectedTotal * 100)
                            : 0;
                        setProgress('receiverProgressWrap', 'receiverProgressBar', 'receiverProgressLabel',
                            'receiverChunkInfo', overallPct,
                            `📥 File ${targetFile.fileIndex + 1}: ${targetFile.name}`,
                            `${formatBytes(recvTotalBytes)} / ${formatBytes(recvExpectedTotal)}${speedTxt}${etaTxt}`
                        );
                    });
                }

                // File Done
                else if (msg.type === 'file_done') {
                    if (!currentRecvFile) return;
                    const cf = currentRecvFile;
                    currentRecvFile = null;

                    enqueueChunk(async () => {
                        const blob = new Blob(cf.chunks, { type: cf.type });
                        const fileInfo = recvFiles[cf.fileIndex];

                        showStatus('receiverStatus', `⏳ Đang xác thực SHA-256 cho file: ${cf.name}...`, 'warn');
                        const receivedHash = await calculateHash(blob);
                        if (receivedHash === cf.originalHash) {
                            fileInfo.verified = true;
                            if (cf.type.startsWith('image/') || cf.type.startsWith('video/')) {
                                fileInfo.previewUrl = URL.createObjectURL(blob);
                            }
                            showStatus('receiverStatus', `✅ Hash khớp — Đang quét mã độc: ${cf.name}...`, 'ok');
                        } else {
                            fileInfo.verified = false;
                            fileInfo.status = 'err';
                            showStatus('receiverStatus', `❌ Lỗi xác thực toàn vẹn: ${cf.name}`, 'err');
                            renderRecvList();
                            return; // Không tải xuống nếu file hỏng
                        }

                        // ── LỚP 4: QUÉT MÃ ĐỘC ──
                        fileInfo.status = 'scanning';
                        renderRecvList();
                        showStatus('receiverStatus', `🔍 Đang quét mã độc cho file: ${cf.name}...`, 'warn');
                        const scanResult = await CustomMalwareScanner.scan(blob, cf.name);
                        fileInfo.scanResult = scanResult;

                        if (!scanResult.safe) {
                            // ❌ PHÁT HIỆN MÃ ĐỘC → Chặn tải xuống
                            fileInfo.status = 'malware';
                            saveTransferHistory(receiverConn.peer, cf.name, cf.size, 'receiver', 'malware');
                            const threatNames = scanResult.threats.map(t => t.message).join(' | ');
                            showStatus('receiverStatus', `🚨 PHÁT HIỆN NGUY HIỂM: ${cf.name} — ${threatNames}`, 'err');
                            playTingSound();
                            renderRecvList();
                            return; // CHẶN — không tải xuống
                        }

                        // ✅ File an toàn → Cho phép tải xuống
                        fileInfo.status = 'ok';
                        saveTransferHistory(receiverConn.peer, cf.name, cf.size, 'receiver', 'completed');
                        showStatus('receiverStatus', `✅ An toàn — Đang tải xuống: ${cf.name}`, 'ok');
                        renderRecvList();

                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = cf.name;
                        document.body.appendChild(a); a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
                }

                // Session Done
                else if (msg.type === 'all_done') {
                    clearAESKeyCache();
                    const ok = recvFiles.filter(f => f.status === 'ok').length;
                    const err = recvFiles.filter(f => f.status === 'err').length;
                    const malware = recvFiles.filter(f => f.status === 'malware').length;
                    const totalIssues = err + malware;
                    setProgress('receiverProgressWrap', 'receiverProgressBar', 'receiverProgressLabel',
                        'receiverChunkInfo', 100,
                        `✅ Nhận xong ${ok} file${totalIssues > 0 ? ` (${err} lỗi, ${malware} mã độc)` : ''}`,
                        formatBytes(recvTotalBytes), true
                    );
                    let msg2;
                    if (malware > 0) {
                        msg2 = `🚨 Nhận xong: ${ok} an toàn, ${malware} file phát hiện mã độc đã bị chặn!`;
                    } else if (err > 0) {
                        msg2 = `⚠️ Nhận xong: ${ok} file thành công, ${err} file lỗi`;
                    } else {
                        msg2 = `✅ Đã nhận, quét an toàn và tải xuống tất cả ${ok} file!`;
                    }
                    showStatus('receiverStatus', msg2, totalIssues > 0 ? (malware > 0 ? 'err' : 'warn') : 'ok');
                    $('receiverStopBtn').style.display = 'none';
                    playTingSound();
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
                el.className = `recv-item ${f.status === 'ok' ? 'verified' : (f.status === 'malware' || f.status === 'err') ? 'bad' : 'receiving'}`;
                el.id = `ri-${i}`;
                const safeName = escapeHtml(f.name);

                let iconHtml = `<span style="font-size:0.9rem">${f.status === 'ok' ? '✅' : f.status === 'malware' ? '🚨' : f.status === 'err' ? '❌' : '📥'}</span>`;
                if (f.previewUrl) {
                    if (f.type.startsWith('image/')) {
                        iconHtml = `<img src="${f.previewUrl}" class="preview-img" alt="img" style="width:24px;height:24px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px;">`;
                    } else if (f.type.startsWith('video/')) {
                        iconHtml = `<video src="${f.previewUrl}" class="preview-img" muted style="width:24px;height:24px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px;"></video>`;
                    }
                }

                let badgeClass = f.status === 'ok' ? 'ok' : (f.status === 'malware' || f.status === 'err') ? 'err' : f.status === 'scanning' ? 'warn' : 'cur';
                let badgeText = f.status === 'ok' ? 'Hoàn thành' : f.status === 'malware' ? '🚨 Mã độc!' : f.status === 'err' ? 'Lỗi' : f.status === 'scanning' ? 'Đang quét mã độc' : 'Đang nhận';

                // Hiển thị chi tiết kết quả quét mã độc
                let scanHtml = '';
                // (Đã ẩn chi tiết quét theo yêu cầu để giao diện gọn hơn)

                el.innerHTML = `
            ${iconHtml}
            <span class="r-name" title="${safeName}">${safeName}</span>
            <span class="r-size">${formatBytes(f.size)}</span>
            <span class="r-badge ${badgeClass}">${badgeText}</span>
            ${scanHtml}
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

        // ── STOP BUTTONS LOGIC ───────────────────────────────────────────
        if ($('senderStopBtn')) {
            $('senderStopBtn').addEventListener('click', () => {
                if (peer) {
                    for (let conns of Object.values(peer.connections)) {
                        conns.forEach(c => c.close());
                    }
                }
                isSending = false;
                $('senderStopBtn').style.display = 'none';
                showStatus('senderStatus', '🛑 Đã dừng truyền file.', 'err');
            });
        }
        if ($('receiverStopBtn')) {
            $('receiverStopBtn').addEventListener('click', () => {
                if (peer) {
                    for (let conns of Object.values(peer.connections)) {
                        conns.forEach(c => c.close());
                    }
                }
                $('receiverStopBtn').style.display = 'none';
                showStatus('receiverStatus', '🛑 Đã dừng nhận file.', 'err');
            });
        }

// --- FILE TRANSFER HISTORY LOGIC ---
async function saveTransferHistory(partnerId, fileName, fileSize, role, status = 'completed') {
    if (!isLoggedIn) return; // Chỉ lưu khi đã đăng nhập
    try {
        await fetch('/api/transfer-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId,
                role,
                fileName,
                fileSize,
                status
            })
        });
        if (document.getElementById('view-history').style.display === 'block') {
            fetchTransferHistory(); // Refresh bảng nếu đang xem
        }
    } catch (err) {
        console.error('Lỗi khi lưu lịch sử:', err);
    }
}

async function fetchTransferHistory() {
    if (!isLoggedIn) return;
    try {
        const res = await fetch('/api/transfer-history');
        const data = await res.json();
        const tbody = document.getElementById('historyTableBody');
        if (!data.success || !data.data || data.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding: 20px;">Không có dữ liệu truyền file nào.</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.data.map(h => {
            const date = new Date(h.timestamp);
            const timeStr = date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN');
            const roleHtml = h.role === 'sender' ? '<span class="role-sender">Gửi</span>' : '<span class="role-receiver">Nhận</span>';
            const statusHtml = h.status === 'completed' ? '<span style="color:var(--green)">Hoàn thành</span>' : 
                                (h.status === 'malware' ? '<span style="color:var(--red)">Mã độc</span>' : '<span style="color:var(--red)">Lỗi</span>');
                                
            return `
                <tr>
                    <td>${timeStr}</td>
                    <td>${roleHtml}</td>
                    <td>${h.partnerId}</td>
                    <td class="file-name">${h.fileName}</td>
                    <td>${formatBytes(h.fileSize)}</td>
                    <td>${statusHtml}</td>
                    <td>
                        <button onclick="deleteTransferHistory('${h._id}')" class="btn btn-sm" style="background:none; border:1px solid var(--border); color:var(--red); padding:4px 8px;">Xóa</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Lỗi tải lịch sử:', err);
        document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--red); padding: 20px;">Lỗi tải dữ liệu.</td></tr>';
    }
}

async function deleteTransferHistory(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa bản ghi lịch sử này?')) return;
    try {
        const res = await fetch('/api/transfer-history/' + id, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast('Đã xóa bản ghi lịch sử', 'success');
            fetchTransferHistory();
        } else {
            showToast('Lỗi khi xóa', 'err');
        }
    } catch (err) {
        console.error('Lỗi khi xóa lịch sử:', err);
        showToast('Lỗi khi xóa', 'err');
    }
}
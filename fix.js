const fs = require('fs');
let content = fs.readFileSync('public/index.html', 'utf8');

const search = '</head>\n            <div class="menu-item" id="menu-chat"';
const search2 = '</head>\r\n            <div class="menu-item" id="menu-chat"';

const replacement = `</head>
<body>
    <div class="app-container">
        <div class="sidebar">
            <div class="brand">☁️ FileShare Pro</div>
            <div class="menu-item active" id="menu-file" onclick="switchTab('file')">
                <span style="font-size:1.2rem">📁</span> Truyền File P2P
            </div>
            <div class="menu-item" id="menu-chat"`;

if (content.includes(search)) {
    content = content.replace(search, replacement);
} else if (content.includes(search2)) {
    content = content.replace(search2, replacement);
} else {
    console.log("Could not find the target string to replace.");
}

fs.writeFileSync('public/index.html', content, 'utf8');
console.log("Fixed index.html");

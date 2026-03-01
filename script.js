const firebaseConfig = {
    apiKey: "AIzaSyCi8cZYVN6gpZRRSMx2qVHKBRRVQZmdWw4",
    authDomain: "analyticalchess.firebaseapp.com",
    databaseURL: "https://analyticalchess-default-rtdb.firebaseio.com",
    projectId: "analyticalchess",
    storageBucket: "analyticalchess.firebasestorage.app",
    messagingSenderId: "1068006653983",
    appId: "1:1068006653983:web:15ef22659ab22a3fda552a"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

var board = null;
var game = new Chess();
var myColor = null;
var roomID = null;

// --- CHESS LOGIC (Preserved) ---
function onDragStart (source, piece, position, orientation) {
    if (game.game_over()) return false;
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || (myColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop (source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn() });
}

function onSnapEnd () { board.position(game.fen()); }

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

// --- MULTIPLAYER & CHAT LOGIC ---
function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Enter a Room ID!");
    
    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('status').innerText = "Playing as " + (color === 'w' ? "White" : "Black");
    if(color === 'b') board.orientation('black');

    // Sync Game State
    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.fen) { game.load(data.fen); board.position(data.fen); }
            if (data.pgn) { updateMoveList(data.pgn); }
        }
    });

    // NEW: Sync Chat Messages
    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
    });
}

// NEW: Send Message Function
function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value;
    if (!text) return;

    const userName = myColor === 'w' ? "White" : "Black";
    database.ref('rooms/' + roomID + '/chat').push({
        user: userName,
        text: text
    });
    input.value = '';
}

function displayMessage(user, text) {
    const chatBox = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<b>${user}:</b> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- UTILS (Preserved) ---
function updateMoveList(pgn) {
    const moveListElement = document.getElementById('move-list');
    moveListElement.innerHTML = '';
    const moves = pgn.split(/\d+\./).filter(Boolean);
    moves.forEach((movePair, index) => {
        const div = document.createElement('div');
        div.className = 'move-item';
        div.innerText = `${index + 1}. ${movePair.trim()}`;
        moveListElement.appendChild(div);
    });
    moveListElement.scrollTop = moveListElement.scrollHeight;
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }

// Allow "Enter" key to send chat
document.getElementById("chatInput")?.addEventListener("keyup", function(event) {
    if (event.key === "Enter") sendMessage();
});

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

// 2. CHESS LOGIC
function onDragStart (source, piece, position, orientation) {
    if (game.game_over()) return false;
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || 
        (myColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || 
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop (source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';

    database.ref('rooms/' + roomID + '/game').set({
        fen: game.fen(),
        pgn: game.pgn()
    });
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

// 3. ROOM & CHAT LOGIC
function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Please enter a Room ID");

    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('status').innerText = "Playing as " + (color === 'w' ? "White" : "Black");
    if(color === 'b') board.orientation('black');

    // Sync Game
    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.fen) { game.load(data.fen); board.position(data.fen); }
            if (data.pgn) { updateMoveList(data.pgn); }
        }
    });

    // Sync Chat
    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
    });
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !roomID) return;

    database.ref('rooms/' + roomID + '/chat').push({
        user: myColor === 'w' ? "White" : "Black",
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

function updateMoveList(pgn) {
    const moveList = document.getElementById('move-list');
    moveList.innerHTML = '';
    const moves = pgn.split(/\d+\./).filter(Boolean);
    moves.forEach((m, i) => {
        const div = document.createElement('div');
        div.style.padding = "2px 0";
        div.innerText = `${i + 1}. ${m.trim()}`;
        moveList.appendChild(div);
    });
    moveList.scrollTop = moveList.scrollHeight;
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }

// Listen for Enter key
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

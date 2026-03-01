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
var highlightEnabled = true;

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
    
    updateGameState();
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

// 3. ANALYTICAL UPDATES (Highlights & Game Over)
function updateGameState() {
    // Clear old highlights
    $('#board .square-55d63').removeClass('highlight-check');

    if (highlightEnabled && game.in_check()) {
        const kingPos = findKing(game.turn());
        $('#board .square-' + kingPos).addClass('highlight-check');
    }

    if (game.game_over()) {
        showGameOver();
    }
}

function findKing(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = String.fromCharCode(97 + c) + (8 - r);
            const piece = game.get(square);
            if (piece && piece.type === 'k' && piece.color === color) {
                return square;
            }
        }
    }
}

function showGameOver() {
    let winner = "Draw";
    let reason = "The game ended in a draw.";
    if (game.in_checkmate()) {
        winner = game.turn() === 'w' ? "Black Wins!" : "White Wins!";
        reason = "Checkmate!";
    } else if (game.in_stalemate()) {
        reason = "Stalemate!";
    }
    document.getElementById('winner-text').innerText = winner;
    document.getElementById('reason-text').innerText = reason;
    document.getElementById('game-over-modal').style.display = 'block';
}

function closeModal() { document.getElementById('game-over-modal').style.display = 'none'; }

function toggleHighlight() {
    highlightEnabled = !highlightEnabled;
    document.getElementById('highlight-toggle').innerText = "🎯 Highlight King: " + (highlightEnabled ? "ON" : "OFF");
    updateGameState();
}

// 4. ROOM & CHAT LOGIC
function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Please enter a Room ID");

    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('status').innerText = "Playing as " + (color === 'w' ? "White" : "Black");
    if(color === 'b') board.orientation('black');

    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.fen) { 
                game.load(data.fen); 
                board.position(data.fen); 
                updateGameState(); 
            }
            if (data.pgn) { updateMoveList(data.pgn); }
        }
    });

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

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

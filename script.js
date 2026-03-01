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
var currentMoveIndex = -1;
var gameHistory = [];
var isGameOver = false;

// 2. CHESS LOGIC & HINTS
function removeGreyDots () { $('#board .square-55d63 .dot').remove(); }
function greyDot (square) {
    var $square = $('#board .square-' + square);
    $square.append('<span class="dot"></span>');
}

function onMouseoverSquare (square, piece) {
    if (!piece || isGameOver) return;
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || 
        (myColor === 'b' && piece.search(/^w/) !== -1)) return;
    var moves = game.moves({ square: square, verbose: true });
    for (var i = 0; i < moves.length; i++) { greyDot(moves[i].to); }
}

function onMouseoutSquare (square, piece) { removeGreyDots(); }

function onDragStart (source, piece, position, orientation) {
    if (isGameOver) return false;
    if (currentMoveIndex !== gameHistory.length - 1) return false; 
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || (myColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop (source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn() });
    updateGameState();
}

function onSnapEnd () { board.position(game.fen()); }

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    onMouseoverSquare: onMouseoverSquare,
    onMouseoutSquare: onMouseoutSquare
};
board = Chessboard('board', config);

// 3. NAVIGATION, FLIP, RESIGN, & DRAW
function prevMove() { if (currentMoveIndex > 0) { currentMoveIndex--; board.position(gameHistory[currentMoveIndex]); } }
function nextMove() { if (currentMoveIndex < gameHistory.length - 1) { currentMoveIndex++; board.position(gameHistory[currentMoveIndex]); } }
function flipBoard() { board.flip(); }

function resignGame() {
    if (!roomID || isGameOver) return;
    if (confirm("Resign the game?")) {
        database.ref('rooms/' + roomID + '/status').set({ type: 'resign', by: myColor });
    }
}

function offerDraw() {
    if (!roomID || isGameOver) return;
    database.ref('rooms/' + roomID + '/status').set({ type: 'drawOffer', by: myColor });
    alert("Draw offer sent.");
}

function handleDraw(accepted) {
    document.getElementById('draw-offer-area').style.display = 'none';
    if (accepted) {
        database.ref('rooms/' + roomID + '/status').set({ type: 'drawAccepted' });
    } else {
        database.ref('rooms/' + roomID + '/status').set({ type: 'drawDeclined', by: myColor });
    }
}

// 4. ANALYTICAL UPDATES
function updateGameState() {
    $('.square-55d63').removeClass('highlight-check');
    if (highlightEnabled && game.in_check()) {
        const kingPos = findKing(game.turn());
        $('.square-' + kingPos).addClass('highlight-check');
    }
    if (game.game_over()) showGameOver();
}

function findKing(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = String.fromCharCode(97 + c) + (8 - r);
            const piece = game.get(square);
            if (piece && piece.type === 'k' && piece.color === color) return square;
        }
    }
}

function showGameOver(type, detail) {
    isGameOver = true;
    let winner = "Draw";
    let reason = "The game ended.";

    if (type === 'resign') {
        winner = (detail === 'w' ? "Black" : "White") + " Wins!";
        reason = (detail === 'w' ? "White" : "Black") + " resigned.";
    } else if (type === 'draw') {
        reason = "Draw by agreement.";
    } else {
        winner = game.in_checkmate() ? (game.turn() === 'w' ? "Black Wins!" : "White Wins!") : "Draw";
        reason = game.in_checkmate() ? "Checkmate!" : "Draw/Stalemate";
    }

    document.getElementById('winner-text').innerText = winner;
    document.getElementById('reason-text').innerText = reason;
    document.getElementById('game-over-modal').style.display = 'block';
}

function closeModal() { document.getElementById('game-over-modal').style.display = 'none'; }
function toggleHighlight() {
    highlightEnabled = !highlightEnabled;
    document.getElementById('highlight-toggle').innerText = (highlightEnabled ? "🎯 King Highlight: ON" : "🎯 King Highlight: OFF");
    updateGameState();
}

// 5. ROOM & CHAT
function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Enter Room ID");
    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    if(color === 'b') board.orientation('black');

    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.fen) {
            game.load(data.fen);
            if (!gameHistory.includes(data.fen)) gameHistory.push(data.fen);
            currentMoveIndex = gameHistory.length - 1;
            board.position(data.fen);
            updateGameState();
            if (data.pgn) updateMoveList(data.pgn);
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.type === 'resign') showGameOver('resign', data.by);
        if (data.type === 'drawOffer' && data.by !== myColor) {
            document.getElementById('draw-offer-area').style.display = 'block';
        }
        if (data.type === 'drawAccepted') showGameOver('draw');
        if (data.type === 'drawDeclined' && data.by !== myColor) alert("Draw offer declined.");
    });

    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
    });
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input.value.trim() || !roomID) return;
    database.ref('rooms/' + roomID + '/chat').push({ user: myColor === 'w' ? "White" : "Black", text: input.value });
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
        div.innerText = `${i + 1}. ${m.trim()}`;
        moveList.appendChild(div);
    });
    moveList.scrollTop = moveList.scrollHeight;
}

function toggleTheme() { document.body.classList.toggle('dark-mode'); }
document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

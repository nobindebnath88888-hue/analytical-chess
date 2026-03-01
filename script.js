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
var soundEnabled = true;
var highlightEnabled = true;
var currentMoveIndex = -1;
var gameHistory = [];
var isGameOver = false;
var timers = { w: 600, b: 600 };
var timerInterval = null;

// CLICK-TO-MOVE STATE
var selectedSquare = null;

// 2. SOUNDS
function playSound(id) {
    if (!soundEnabled) return;
    const sound = document.getElementById(id);
    if (sound) { sound.currentTime = 0; sound.play().catch(e => {}); }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').innerText = soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
}

// 3. MATCHMAKING
function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    const matchBtn = document.getElementById('match-btn');
    matchBtn.disabled = true;
    statusMsg.innerText = "Searching for an opponent...";

    const waitingRef = database.ref('waitingRoom');
    waitingRef.once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            roomID = data.roomID;
            waitingRef.remove();
            const coinFlip = Math.random() < 0.5;
            myColor = coinFlip ? 'w' : 'b';
            database.ref('rooms/' + roomID + '/matchReady').set({ start: true, whitePlayerColor: myColor === 'w' ? 'joiner' : 'waiter' });
            initGame(myColor);
        } else {
            roomID = "room_" + Math.floor(Math.random() * 1000000);
            waitingRef.set({ roomID: roomID });
            database.ref('rooms/' + roomID + '/matchReady').on('value', (s) => {
                const r = s.val();
                if (r && r.start) { myColor = r.whitePlayerColor === 'waiter' ? 'w' : 'b'; initGame(myColor); }
            });
        }
    });
}

function initGame(color) {
    playSound('snd-game-start');
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    if (color === 'b') board.orientation('black');
    listenToGameUpdates();
}

// 4. CLICK & DRAG LOGIC
function removeGreyDots() { 
    $('#board .square-55d63').removeClass('highlight-selected');
    $('#board .square-55d63 .dot').remove(); 
}

function greyDot(square) {
    var $square = $('#board .square-' + square);
    $square.append('<span class="dot"></span>');
}

function onSquareClick(square) {
    if (isGameOver || !myColor || game.turn() !== myColor) return;
    if (currentMoveIndex !== gameHistory.length - 1) return;

    // If a square is already selected, try to move
    if (selectedSquare) {
        var move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        
        if (move === null) {
            // Check if user clicked another of their own pieces to switch selection
            var piece = game.get(square);
            if (piece && piece.color === myColor) {
                selectedSquare = square;
                showLegalMoves(square);
            } else {
                selectedSquare = null;
                removeGreyDots();
            }
        } else {
            // Valid Click Move
            selectedSquare = null;
            removeGreyDots();
            afterMoveActions(move);
        }
    } else {
        // First click: select piece
        var piece = game.get(square);
        if (piece && piece.color === myColor) {
            selectedSquare = square;
            showLegalMoves(square);
        }
    }
}

function showLegalMoves(square) {
    removeGreyDots();
    $('#board .square-' + square).addClass('highlight-selected');
    var moves = game.moves({ square: square, verbose: true });
    if (moves.length === 0) return;
    for (var i = 0; i < moves.length; i++) { greyDot(moves[i].to); }
}

function onDrop(source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    selectedSquare = null;
    removeGreyDots();
    afterMoveActions(move);
}

function afterMoveActions(move) {
    if (move.captured) playSound('snd-capture');
    else if (game.in_check()) playSound('snd-check');
    else playSound('snd-move');

    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    updateGameState();
}

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: (s, p) => {
        if (isGameOver || !myColor) return false;
        if (currentMoveIndex !== gameHistory.length - 1) return false;
        if (p.search(new RegExp('^' + (myColor === 'w' ? 'b' : 'w'))) !== -1) return false;
        if (game.turn() !== myColor) return false;
    },
    onDrop: onDrop,
    onSnapEnd: () => { board.position(game.fen()); }
};
board = Chessboard('board', config);

// Add Click Listener to squares
$('#board').on('click', '.square-55d63', function() {
    var square = $(this).attr('data-square');
    onSquareClick(square);
});

// 5. FIREBASE & TIMERS
function listenToGameUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.fen) {
            const isNewMove = data.fen !== game.fen();
            game.load(data.fen);
            if (data.timers) timers = data.timers;
            if (!gameHistory.includes(data.fen)) gameHistory.push(data.fen);
            currentMoveIndex = gameHistory.length - 1;
            board.position(data.fen);
            
            if (isNewMove) {
                const h = game.history({verbose: true});
                const last = h[h.length - 1];
                if (game.in_check()) playSound('snd-check');
                else if (last && last.captured) playSound('snd-capture');
                else playSound('snd-move');
            }
            updateGameState();
            updateTimerDisplay();
            if (data.pgn) updateMoveList(data.pgn);
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (snapshot) => {
        const d = snapshot.val();
        if (!d) return;
        if (['resign', 'timeout', 'drawAccepted'].includes(d.type) || game.game_over()) { if (!isGameOver) playSound('snd-game-end'); }
        if (d.type === 'resign') showGameOver('resign', d.by);
        if (d.type === 'timeout') showGameOver('timeout', d.by);
        if (d.type === 'drawOffer' && d.by !== myColor) document.getElementById('draw-offer-area').style.display = 'block';
        if (d.type === 'drawAccepted') showGameOver('draw');
        if (d.type === 'newGameStarted') resetLocalGame();
    });

    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
        if (msg.user !== (myColor === 'w' ? "White" : "Black")) playSound('snd-msg');
    });
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isGameOver) return;
        timers[game.turn()]--;
        updateTimerDisplay();
        if (timers[game.turn()] <= 0) {
            clearInterval(timerInterval);
            database.ref('rooms/' + roomID + '/status').set({ type: 'timeout', by: game.turn() });
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`;
    document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`;
    document.getElementById('white-timer').classList.toggle('active', game.turn() === 'w');
    document.getElementById('black-timer').classList.toggle('active', game.turn() === 'b');
}

function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`; }

function showGameOver(type, detail) {
    if (isGameOver) return;
    isGameOver = true; clearInterval(timerInterval); playSound('snd-game-end');
    let winner = "Draw", reason = "Game Over";
    if (type === 'resign') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = "Resignation"; }
    else if (type === 'timeout') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = "Time out"; }
    else { winner = game.in_checkmate() ? (game.turn() === 'w' ? "Black" : "White") + " Wins!" : "Draw"; reason = game.in_checkmate() ? "Checkmate" : "Draw"; }
    document.getElementById('winner-text').innerText = winner;
    document.getElementById('reason-text').innerText = reason;
    document.getElementById('game-over-modal').style.display = 'block';
}

function updateGameState() {
    $('.square-55d63').removeClass('highlight-check highlight-last-move');
    const h = game.history({ verbose: true });
    if (h.length > 0) {
        const l = h[h.length - 1];
        $(`.square-${l.from}, .square-${l.to}`).addClass('highlight-last-move');
    }
    if (highlightEnabled && game.in_check()) {
        const k = findKing(game.turn());
        $(`.square-${k}`).addClass('highlight-check');
    }
    if (game.game_over()) showGameOver();
    else if (roomID) startTimer();
}

function findKing(c) {
    for (let r = 0; r < 8; r++) {
        for (let c2 = 0; c2 < 8; c2++) {
            const sq = String.fromCharCode(97 + c2) + (8 - r);
            const p = game.get(sq);
            if (p && p.type === 'k' && p.color === c) return sq;
        }
    }
}

// 6. UI ACTIONS
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
    const list = document.getElementById('move-list');
    list.innerHTML = '';
    const moves = pgn.split(/\d+\./).filter(Boolean);
    moves.forEach((m, i) => {
        const d = document.createElement('div');
        d.innerText = `${i + 1}. ${m.trim()}`;
        list.appendChild(d);
    });
    list.scrollTop = list.scrollHeight;
}
function resetLocalGame() {
    game = new Chess(); gameHistory = [game.fen()]; currentMoveIndex = 0; isGameOver = false;
    timers = { w: 600, b: 600 }; board.position('start');
    document.getElementById('game-over-modal').style.display = 'none';
    updateGameState(); updateTimerDisplay();
}
function requestNewGame() { database.ref('rooms/' + roomID + '/status').set({ type: 'rematchRequest', by: myColor }); }
function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function flipBoard() { board.flip(); }
function closeModal() { document.getElementById('game-over-modal').style.display = 'none'; }
function toggleHighlight() { highlightEnabled = !highlightEnabled; updateGameState(); }
function prevMove() { if (currentMoveIndex > 0) { currentMoveIndex--; board.position(gameHistory[currentMoveIndex]); } }
function nextMove() { if (currentMoveIndex < gameHistory.length - 1) { currentMoveIndex++; board.position(gameHistory[currentMoveIndex]); } }
function resignGame() { if (confirm("Resign?")) database.ref('rooms/' + roomID + '/status').set({ type: 'resign', by: myColor }); }
function offerDraw() { database.ref('rooms/' + roomID + '/status').set({ type: 'drawOffer', by: myColor }); }
function handleDraw(acc) {
    document.getElementById('draw-offer-area').style.display = 'none';
    if (acc) database.ref('rooms/' + roomID + '/status').set({ type: 'drawAccepted' });
}
function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}
document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

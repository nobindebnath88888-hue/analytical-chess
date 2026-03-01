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
var timers = { w: 600, b: 600 };
var timerInterval = null;

// 2. MATCHMAKING LOGIC
function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    const matchBtn = document.getElementById('match-btn');
    matchBtn.disabled = true;
    statusMsg.innerText = "Searching for opponent...";

    const waitingRef = database.ref('waitingRoom');
    
    waitingRef.once('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            // Someone is waiting! Join their room.
            roomID = data.roomID;
            waitingRef.remove(); // Clear waiting room
            
            // Randomly assign colors
            const coinFlip = Math.random() < 0.5;
            myColor = coinFlip ? 'w' : 'b';
            const oppColor = myColor === 'w' ? 'b' : 'w';

            // Signal to the waiting player that the match is starting
            database.ref('rooms/' + roomID + '/matchReady').set({
                start: true,
                whitePlayerColor: myColor === 'w' ? 'joiner' : 'waiter'
            });

            initGame(myColor);
        } else {
            // No one waiting. Create a room and wait.
            roomID = "room_" + Math.floor(Math.random() * 1000000);
            waitingRef.set({ roomID: roomID });

            // Listen for someone to join
            database.ref('rooms/' + roomID + '/matchReady').on('value', (snapshot) => {
                const readyData = snapshot.val();
                if (readyData && readyData.start) {
                    myColor = readyData.whitePlayerColor === 'waiter' ? 'w' : 'b';
                    initGame(myColor);
                }
            });
        }
    });
}

function initGame(color) {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    document.getElementById('status').innerText = "Game Started! You are " + (color === 'w' ? "White" : "Black");
    
    if (color === 'b') board.orientation('black');
    
    listenToGameUpdates();
}

// 3. CHESS & TIMER LOGIC (Preserved from previous version)
function removeGreyDots () { $('#board .square-55d63 .dot').remove(); }
function greyDot (square) {
    var $square = $('#board .square-' + square);
    $square.append('<span class="dot"></span>');
}

function onMouseoverSquare (square, piece) {
    if (!piece || isGameOver) return;
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || (myColor === 'b' && piece.search(/^w/) !== -1)) return;
    var moves = game.moves({ square: square, verbose: true });
    for (var i = 0; i < moves.length; i++) { greyDot(moves[i].to); }
}

function onMouseoutSquare (square, piece) { removeGreyDots(); }

function onDragStart (source, piece, position, orientation) {
    if (isGameOver || !myColor) return false;
    if (currentMoveIndex !== gameHistory.length - 1) return false; 
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || (myColor === 'b' && piece.search(/^w/) !== -1)) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop (source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    updateGameState();
}

function onSnapEnd () { board.position(game.fen()); }

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: onDragStart, onDrop: onDrop, onSnapEnd: onSnapEnd,
    onMouseoverSquare: onMouseoverSquare, onMouseoutSquare: onMouseoutSquare
};
board = Chessboard('board', config);

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isGameOver) return clearInterval(timerInterval);
        let turn = game.turn();
        timers[turn]--;
        updateTimerDisplay();
        if (timers[turn] <= 0) {
            clearInterval(timerInterval);
            database.ref('rooms/' + roomID + '/status').set({ type: 'timeout', by: turn });
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`;
    document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`;
    document.getElementById('white-timer').classList.toggle('active', game.turn() === 'w');
    document.getElementById('black-timer').classList.toggle('active', game.turn() === 'b');
}

function formatTime(seconds) {
    let min = Math.floor(seconds / 60);
    let sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// 4. FIREBASE LISTENERS
function listenToGameUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.fen) {
            game.load(data.fen);
            if (data.timers) timers = data.timers;
            if (!gameHistory.includes(data.fen)) gameHistory.push(data.fen);
            currentMoveIndex = gameHistory.length - 1;
            board.position(data.fen);
            updateGameState();
            updateTimerDisplay();
            if (data.pgn) updateMoveList(data.pgn);
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.type === 'resign') showGameOver('resign', data.by);
        if (data.type === 'timeout') showGameOver('timeout', data.by);
        if (data.type === 'drawOffer' && data.by !== myColor) document.getElementById('draw-offer-area').style.display = 'block';
        if (data.type === 'drawAccepted') showGameOver('draw');
        if (data.type === 'newGameStarted') resetLocalGame();
    });

    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
    });
}

// 5. UTILITY FUNCTIONS
function updateGameState() {
    $('.square-55d63').removeClass('highlight-check').removeClass('highlight-last-move');
    const history = game.history({ verbose: true });
    if (history.length > 0) {
        const lastMove = history[history.length - 1];
        $('.square-' + lastMove.from).addClass('highlight-last-move');
        $('.square-' + lastMove.to).addClass('highlight-last-move');
    }
    if (highlightEnabled && game.in_check()) {
        const kingPos = findKing(game.turn());
        $('.square-' + kingPos).addClass('highlight-check');
    }
    if (game.game_over()) showGameOver();
    else if (roomID) startTimer();
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
    clearInterval(timerInterval);
    let winner = "Draw", reason = "The game ended.";
    if (type === 'resign') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = (detail === 'w' ? "White" : "Black") + " resigned."; }
    else if (type === 'draw') reason = "Draw by agreement.";
    else if (type === 'timeout') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = (detail === 'w' ? "White" : "Black") + " ran out of time."; }
    else { winner = game.in_checkmate() ? (game.turn() === 'w' ? "Black Wins!" : "White Wins!") : "Draw"; reason = game.in_checkmate() ? "Checkmate!" : "Draw/Stalemate"; }
    document.getElementById('winner-text').innerText = winner;
    document.getElementById('reason-text').innerText = reason;
    document.getElementById('game-over-modal').style.display = 'block';
}

function resetLocalGame() {
    game = new Chess();
    gameHistory = [game.fen()];
    currentMoveIndex = 0;
    isGameOver = false;
    timers = { w: 600, b: 600 };
    board.position('start');
    closeModal();
    updateGameState();
    updateTimerDisplay();
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

function flipBoard() { board.flip(); }
function closeModal() { document.getElementById('game-over-modal').style.display = 'none'; }
function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function offerDraw() {
    if (!roomID || isGameOver) return;
    database.ref('rooms/' + roomID + '/status').set({ type: 'drawOffer', by: myColor });
}
function handleDraw(accepted) {
    document.getElementById('draw-offer-area').style.display = 'none';
    if (accepted) database.ref('rooms/' + roomID + '/status').set({ type: 'drawAccepted' });
    else database.ref('rooms/' + roomID + '/status').set({ type: 'drawDeclined', by: myColor });
}
function resignGame() {
    if (!roomID || isGameOver) return;
    if (confirm("Resign?")) database.ref('rooms/' + roomID + '/status').set({ type: 'resign', by: myColor });
}
function prevMove() { if (currentMoveIndex > 0) { currentMoveIndex--; board.position(gameHistory[currentMoveIndex]); } }
function nextMove() { if (currentMoveIndex < gameHistory.length - 1) { currentMoveIndex++; board.position(gameHistory[currentMoveIndex]); } }

document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

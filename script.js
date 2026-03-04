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

// 1. GLOBALS & ELO INITIALIZATION
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
var selectedSquare = null;

// Persistent Player Info
let myRating = parseInt(localStorage.getItem('chess_elo')) || 1200;
let myPlayerName = localStorage.getItem('chess_player_name') || "Player_" + Math.floor(Math.random() * 1000);
localStorage.setItem('chess_player_name', myPlayerName);
document.getElementById('elo-value').innerText = myRating;

// 2. LEADERBOARD LOGIC
function updateLeaderboard() {
    database.ref('leaderboard/' + myPlayerName).set(myRating);
}

function fetchLeaderboard() {
    const lbRef = database.ref('leaderboard').orderByValue().limitToLast(5);
    lbRef.on('value', (snapshot) => {
        const lbList = document.getElementById('leaderboard-list');
        lbList.innerHTML = '';
        let players = [];
        snapshot.forEach(child => {
            players.push({ name: child.key, elo: child.val() });
        });
        players.reverse().forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'leaderboard-item';
            div.innerHTML = `<span>#${i + 1} ${p.name}</span> <b>${p.elo}</b>`;
            lbList.appendChild(div);
        });
    });
}
fetchLeaderboard();

function updateElo(won, draw = false) {
    const K = 32;
    const expectedScore = 0.5; // Simplified for this demo
    let actualScore = won ? 1 : (draw ? 0.5 : 0);
    myRating = Math.round(myRating + K * (actualScore - expectedScore));
    localStorage.setItem('chess_elo', myRating);
    document.getElementById('elo-value').innerText = myRating;
    updateLeaderboard();
}

// 3. SOUNDS
function playSound(id) {
    if (!soundEnabled) return;
    const sound = document.getElementById(id);
    if (sound) { sound.currentTime = 0; sound.play().catch(e => {}); }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').innerText = soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
}

// 4. MATCHMAKING
function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    const selectedSeconds = parseInt(document.getElementById('time-control').value);
    document.getElementById('match-btn').disabled = true;
    statusMsg.innerText = "Searching for opponent...";

    const waitingRef = database.ref('waitingRoom');
    waitingRef.once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            roomID = data.roomID;
            waitingRef.remove();
            myColor = Math.random() < 0.5 ? 'w' : 'b';
            database.ref('rooms/' + roomID + '/matchReady').set({ 
                start: true, 
                whitePlayerColor: myColor === 'w' ? 'joiner' : 'waiter',
                initialTime: selectedSeconds
            });
            initGame(myColor);
        } else {
            roomID = "room_" + Math.floor(Math.random() * 1000000);
            waitingRef.set({ roomID: roomID, time: selectedSeconds });
            database.ref('rooms/' + roomID + '/matchReady').on('value', (s) => {
                const r = s.val();
                if (r && r.start) { 
                    myColor = r.whitePlayerColor === 'waiter' ? 'w' : 'b'; 
                    timers = { w: r.initialTime, b: r.initialTime };
                    initGame(myColor); 
                }
            });
        }
    });
}

function initGame(color) {
    playSound('snd-game-start');
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    if (color !== 'spectator') {
        document.getElementById('draw-btn').disabled = false;
        document.getElementById('resign-btn').disabled = false;
    }
    if (color === 'b') board.orientation('black');
    listenToGameUpdates();
}

// 5. MOVE LOGIC
function removeGreyDots() { 
    $('#board .square-55d63').removeClass('highlight-selected');
    $('#board .square-55d63 .dot').remove(); 
}

function onSquareClick(square) {
    if (isGameOver || !myColor || myColor === 'spectator' || game.turn() !== myColor) return;
    if (currentMoveIndex !== gameHistory.length - 1 && gameHistory.length > 0) return;

    if (selectedSquare) {
        var move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (move === null) {
            var piece = game.get(square);
            if (piece && piece.color === myColor) {
                selectedSquare = square;
                showLegalMoves(square);
            } else {
                selectedSquare = null;
                removeGreyDots();
            }
        } else {
            selectedSquare = null;
            removeGreyDots();
            afterMoveActions(move);
        }
    } else {
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
    for (var i = 0; i < moves.length; i++) {
        var $sq = $('#board .square-' + moves[i].to);
        $sq.append('<span class="dot"></span>');
    }
}

function afterMoveActions(move) {
    if (move.captured) playSound('snd-capture');
    else if (game.in_check()) playSound('snd-check');
    else playSound('snd-move');
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    updateGameState();
}

// 6. BOARD CONFIG
var config = {
    draggable: true,
    position: 'start',
    onDragStart: (s, p) => {
        if (isGameOver || myColor === 'spectator' || !myColor || game.turn() !== myColor) return false;
        if (p.search(new RegExp('^' + (myColor === 'w' ? 'b' : 'w'))) !== -1) return false;
    },
    onDrop: (s, t) => {
        var move = game.move({ from: s, to: t, promotion: 'q' });
        if (move === null) return 'snapback';
        afterMoveActions(move);
    },
    onSnapEnd: () => { board.position(game.fen()); }
};
board = Chessboard('board', config);
$('#board').on('click', '.square-55d63', function() { onSquareClick($(this).attr('data-square')); });

// 7. SYNC & TIMERS
function listenToGameUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.fen) {
            const isNewMove = data.fen !== game.fen();
            game.load(data.fen);
            if (data.timers) timers = data.timers;
            if (isNewMove) {
                gameHistory.push(data.fen);
                currentMoveIndex = gameHistory.length - 1;
                board.position(data.fen);
            }
            updateGameState(); updateTimerDisplay(); updateMoveList(data.pgn || "");
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (snapshot) => {
        const d = snapshot.val();
        if (!d || isGameOver) return;
        if (d.type === 'resign') showGameOver('resign', d.by);
        if (d.type === 'timeout') showGameOver('timeout', d.by);
        if (d.type === 'drawOffer' && d.by !== myColor && myColor !== 'spectator') 
            document.getElementById('draw-offer-area').style.display = 'block';
        if (d.type === 'drawAccepted') showGameOver('draw');
    });

    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
    });
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isGameOver) return;
        timers[game.turn()]--;
        updateTimerDisplay();
        if (timers[game.turn()] <= 0 && myColor === game.turn()) {
            database.ref('rooms/' + roomID + '/status').set({ type: 'timeout', by: game.turn() });
        }
    }, 1000);
}

function showGameOver(type, detail) {
    if (isGameOver) return;
    isGameOver = true; clearInterval(timerInterval); playSound('snd-game-end');
    let win = false, draw = false, title = "Draw";
    
    if (type === 'resign' || type === 'timeout') {
        win = (myColor !== detail);
        title = win ? "You Win!" : "You Lose!";
    } else {
        if (game.in_checkmate()) {
            win = (game.turn() !== myColor);
            title = win ? "You Win!" : "You Lose!";
        } else { draw = true; title = "Draw"; }
    }

    if (myColor !== 'spectator') updateElo(win, draw);
    document.getElementById('winner-text').innerText = title;
    document.getElementById('game-over-modal').style.display = 'block';
}

function updateTimerDisplay() {
    document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`;
    document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`;
    document.getElementById('white-timer').classList.toggle('active', game.turn() === 'w');
    document.getElementById('black-timer').classList.toggle('active', game.turn() === 'b');
}

function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`; }

function updateGameState() {
    $('.square-55d63').removeClass('highlight-check highlight-last-move');
    const h = game.history({ verbose: true });
    if (h.length > 0) {
        const l = h[h.length - 1];
        $(`.square-${l.from}, .square-${l.to}`).addClass('highlight-last-move');
    }
    if (highlightEnabled && game.in_check()) {
        const boardState = game.board();
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const p = boardState[i][j];
                if (p && p.type === 'k' && p.color === game.turn()) {
                    $(`.square-${String.fromCharCode(97 + j)}${8 - i}`).addClass('highlight-check');
                }
            }
        }
    }
    if (game.game_over()) showGameOver();
    else if (roomID) startTimer();
}

// 8. HELPERS
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
function requestNewGame() { location.reload(); }
document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

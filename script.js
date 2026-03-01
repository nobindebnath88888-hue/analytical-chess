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

// 2. SOUND MANAGER
function playSound(id) {
    if (!soundEnabled) return;
    const sound = document.getElementById(id);
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log("Sound blocked by browser policy. Interact with page first."));
    }
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
    statusMsg.innerText = "Searching for opponent...";

    const waitingRef = database.ref('waitingRoom');
    
    waitingRef.once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            roomID = data.roomID;
            waitingRef.remove();
            const coinFlip = Math.random() < 0.5;
            myColor = coinFlip ? 'w' : 'b';
            database.ref('rooms/' + roomID + '/matchReady').set({
                start: true,
                whitePlayerColor: myColor === 'w' ? 'joiner' : 'waiter'
            });
            initGame(myColor);
        } else {
            roomID = "room_" + Math.floor(Math.random() * 1000000);
            waitingRef.set({ roomID: roomID });
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
    playSound('snd-game-start');
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    
    if (color === 'b') board.orientation('black');
    listenToGameUpdates();
}

// 4. CHESS LOGIC
function onDrop (source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    // Play sound based on move type
    if (move.captured) playSound('snd-capture');
    else if (game.in_check()) playSound('snd-check');
    else playSound('snd-move');

    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    updateGameState();
}

function onSnapEnd () { board.position(game.fen()); }

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: (s, p) => {
        if (isGameOver || !myColor) return false;
        if (currentMoveIndex !== gameHistory.length - 1) return false; 
        if ((myColor === 'w' && p.search(/^b/) !== -1) || (myColor === 'b' && p.search(/^w/) !== -1)) return false;
        if ((game.turn() === 'w' && p.search(/^b/) !== -1) || (game.turn() === 'b' && p.search(/^w/) !== -1)) return false;
    },
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

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
                // Play sounds for opponent's moves
                if (game.in_check()) playSound('snd-check');
                else if (game.history().length > 0 && game.history({verbose: true}).pop().captured) playSound('snd-capture');
                else playSound('snd-move');
            }

            updateGameState();
            updateTimerDisplay();
            if (data.pgn) updateMoveList(data.pgn);
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (['resign', 'timeout', 'drawAccepted'].includes(data.type) || game.game_over()) {
            if (!isGameOver) playSound('snd-game-end');
        }
        if (data.type === 'resign') showGameOver('resign', data.by);
        if (data.type === 'timeout') showGameOver('timeout', data.by);
        if (data.type === 'drawOffer' && data.by !== myColor) document.getElementById('draw-offer-area').style.display = 'block';
        if (data.type === 'drawAccepted') showGameOver('draw');
        if (data.type === 'newGameStarted') resetLocalGame();
    });

    database.ref('rooms/' + roomID + '/chat').on('child_added', (snapshot) => {
        const msg = snapshot.val();
        displayMessage(msg.user, msg.text);
        if (msg.user !== (myColor === 'w' ? "White" : "Black")) playSound('snd-msg');
    });
}

// 6. UI & HELPERS
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
    isGameOver = true;
    clearInterval(timerInterval);
    playSound('snd-game-end');
    let winner = "Draw", reason = "Game ended.";
    if (type === 'resign') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = "Resignation."; }
    else if (type === 'timeout') { winner = (detail === 'w' ? "Black" : "White") + " Wins!"; reason = "Time out."; }
    else { winner = game.in_checkmate() ? (game.turn() === 'w' ? "Black Wins!" : "White Wins!") : "Draw"; reason = game.in_checkmate() ? "Checkmate!" : "Stalemate"; }
    document.getElementById('winner-text').innerText = winner;
    document.getElementById('reason-text').innerText = reason;
    document.getElementById('game-over-modal').style.display = 'block';
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

function updateGameState() {
    $('.square-55d63').removeClass('highlight-check highlight-last-move');
    const history = game.history({ verbose: true });
    if (history.length > 0) {
        const lastMove = history[history.length - 1];
        $(`.square-${lastMove.from}, .square-${lastMove.to}`).addClass('highlight-last-move');
    }
    if (highlightEnabled && game.in_check()) {
        const kingPos = findKing(game.turn());
        $(`.square-${kingPos}`).addClass('highlight-check');
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

function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function flipBoard() { board.flip(); }
function closeModal() { document.getElementById('game-over-modal').style.display = 'none'; }
function prevMove() { if (currentMoveIndex > 0) { currentMoveIndex--; board.position(gameHistory[currentMoveIndex]); } }
function nextMove() { if (currentMoveIndex < gameHistory.length - 1) { currentMoveIndex++; board.position(gameHistory[currentMoveIndex]); } }
document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

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

var board = null, game = new Chess(), myColor = null, roomID = null;
var isGameOver = false, timers = { w: 600, b: 600 }, timerInterval = null;
var pendingMove = null, gameHistory = [], currentMoveIndex = -1;

// 2. REPAIRED MATCHMAKING
function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    const matchBtn = document.getElementById('match-btn');
    
    matchBtn.disabled = true;
    statusMsg.innerText = "Searching for game...";

    const waitingRef = database.ref('waitingRoom');

    waitingRef.transaction((currentData) => {
        if (currentData === null) {
            roomID = "room_" + Math.floor(Math.random() * 100000);
            return { roomID: roomID };
        } else {
            roomID = currentData.roomID;
            return null; // Join and clear the queue
        }
    }, (error, committed, snapshot) => {
        if (error) {
            console.error("Firebase Transaction Failed:", error);
            statusMsg.innerText = "Error: " + error.message;
            matchBtn.disabled = false;
        } else {
            if (committed) {
                // I created the room (White)
                myColor = 'w';
                statusMsg.innerText = "Waiting for opponent to join...";
                database.ref('rooms/' + roomID + '/matchReady').on('value', (s) => {
                    if (s.val() && s.val().joined) {
                        database.ref('rooms/' + roomID + '/matchReady').off();
                        initGame('w');
                    }
                });
            } else {
                // I joined an existing room (Black)
                myColor = 'b';
                statusMsg.innerText = "Opponent found! Loading...";
                database.ref('rooms/' + roomID + '/matchReady').set({ joined: true });
                initGame('b');
            }
        }
    });
}

function initGame(c) {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    
    if (c === 'b') board.orientation('black');
    
    // Start listeners
    listenToGameUpdates();
    
    // If white, set initial board in DB
    if (c === 'w') {
        database.ref('rooms/' + roomID + '/game').set({
            fen: game.fen(),
            pgn: "",
            timers: { w: 600, b: 600 }
        });
    }
}

// 3. LISTENERS & SYNC
function listenToGameUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (s) => {
        const data = s.val();
        if (data && data.fen && data.fen !== game.fen()) {
            game.load(data.fen);
            timers = data.timers || timers;
            board.position(data.fen);
            updateGameState();
        }
    });

    database.ref('rooms/' + roomID + '/status').on('value', (s) => {
        const d = s.val();
        if (d?.type === 'resign') showGameOver('resign', d.by);
    });
}

// 4. BOARD LOGIC
function onDrop(source, target) {
    if (!myColor || isGameOver || game.turn() !== myColor) return 'snapback';
    
    let move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    game.undo();

    // Promotion Check
    let isProm = (move.color === 'w' && target[1] === '8' && move.piece === 'p') || 
                  (move.color === 'b' && target[1] === '1' && move.piece === 'p');
    
    if (isProm) {
        pendingMove = { from: source, to: target };
        document.getElementById('promotion-modal').style.display = 'block';
        return 'snapback';
    }

    executeMove(source, target, 'q');
}

function selectPromotion(type) {
    document.getElementById('promotion-modal').style.display = 'none';
    executeMove(pendingMove.from, pendingMove.to, type);
    board.position(game.fen());
}

function executeMove(f, t, p) {
    let move = game.move({ from: f, to: t, promotion: p });
    database.ref('rooms/' + roomID + '/game').set({
        fen: game.fen(),
        pgn: game.pgn(),
        timers: timers
    });
    updateGameState();
}

function updateGameState() {
    updateCaptures();
    if (game.in_draw() || game.in_threefold_repetition()) showGameOver('draw');
    if (game.game_over()) showGameOver();
    startTimer();
}

// 5. UTILS
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (!isGameOver) {
            timers[game.turn()]--;
            document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`;
            document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`;
            if (timers[game.turn()] <= 0) showGameOver('timeout', game.turn());
        }
    }, 1000);
}

function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`; }

function showGameOver(type, detail) {
    isGameOver = true;
    clearInterval(timerInterval);
    document.getElementById('winner-text').innerText = "Game Over";
    document.getElementById('game-over-modal').style.display = 'block';
}

function updateCaptures() {
    const icons = { p:'♙', r:'♖', n:'♘', b:'♗', q:'♕', P:'♟', R:'♜', N:'♞', B:'♝', Q:'♛' };
    let capW = [], capB = [];
    game.history({verbose:true}).forEach(m => {
        if(m.captured) (m.color==='w' ? capW : capB).push(icons[m.color==='w' ? m.captured.toUpperCase() : m.captured]);
    });
    document.getElementById('white-captured').innerText = capW.join(' ');
    document.getElementById('black-captured').innerText = capB.join(' ');
}

var config = { draggable: true, position: 'start', onDrop: onDrop, onSnapEnd: () => board.position(game.fen()) };
board = Chessboard('board', config);

function toggleTheme() { document.body.classList.toggle('dark-mode'); }

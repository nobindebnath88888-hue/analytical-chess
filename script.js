const firebaseConfig = {
    apiKey: "AIzaSyCi8cZYVN6gpZRRSMx2qVHKBRRVQZmdWw4",
    authDomain: "analyticalchess.firebaseapp.com",
    databaseURL: "https://analyticalchess-default-rtdb.firebaseio.com",
    projectId: "analyticalchess",
    storageBucket: "analyticalchess.firebasestorage.app",
    messagingSenderId: "1068006653983",
    appId: "1:1068006653983:web:15ef22659ab22a3fda552a"
};



const database = firebase.database();

var board = null, game = new Chess(), myColor = null, roomID = null;
var isGameOver = false, timers = { w: 600, b: 600 }, timerInterval = null;
var pendingMove = null;

// 2. THEME SWITCHER
function setTheme(theme) {
    document.body.className = '';
    if (theme !== 'default') document.body.classList.add('theme-' + theme);
    
    // Update pieces style based on theme
    let piecePath = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'; // default
    if (theme === 'glass') {
        // High-quality glossy pieces
        piecePath = 'https://raw.githubusercontent.com/shaack/cm-chessboard/master/assets/images/pieces/staunty/{piece}.svg';
    }
    
    board.destroy();
    board = Chessboard('board', {
        draggable: true,
        position: game.fen(),
        pieceTheme: piecePath,
        onDrop: onDrop,
        onSnapEnd: () => board.position(game.fen())
    });
}

// 3. MATCHMAKING
function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    const matchBtn = document.getElementById('match-btn');
    matchBtn.disabled = true;
    statusMsg.innerText = "Connecting...";

    const waitingRef = database.ref('waitingRoom');
    waitingRef.transaction((data) => {
        if (data === null) {
            roomID = "room_" + Math.floor(Math.random() * 100000);
            return { roomID: roomID };
        } else {
            roomID = data.roomID;
            return null;
        }
    }, (err, committed) => {
        if (committed) {
            myColor = 'w';
            statusMsg.innerText = "Waiting for player...";
            database.ref('rooms/' + roomID + '/ready').on('value', (s) => { if(s.val()) initGame('w'); });
        } else {
            myColor = 'b';
            database.ref('rooms/' + roomID + '/ready').set(true);
            initGame('b');
        }
    });
}

function initGame(c) {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    if (c === 'b') board.orientation('black');
    listenToUpdates();
}

function listenToUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (s) => {
        const d = s.val();
        if (d && d.fen !== game.fen()) {
            game.load(d.fen);
            timers = d.timers || timers;
            board.position(d.fen);
            updateUI();
        }
    });
}

// 4. CORE MOVES
function onDrop(source, target) {
    if (!myColor || isGameOver || game.turn() !== myColor) return 'snapback';
    let move = game.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';
    game.undo();

    if ((move.color === 'w' && target[1] === '8' && move.piece === 'p') || (move.color === 'b' && target[1] === '1' && move.piece === 'p')) {
        pendingMove = { from: source, to: target };
        document.getElementById('promotion-modal').style.display = 'block';
        return 'snapback';
    }
    sendMove(source, target, 'q');
}

function sendMove(f, t, p) {
    game.move({ from: f, to: t, promotion: p });
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), timers: timers });
    updateUI();
}

function selectPromotion(type) {
    document.getElementById('promotion-modal').style.display = 'none';
    sendMove(pendingMove.from, pendingMove.to, type);
    board.position(game.fen());
}

function updateUI() {
    updateCaptures();
    if (game.game_over()) showGameOver();
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timers[game.turn()]--;
        document.getElementById('white-timer').innerText = `White: ${Math.floor(timers.w/60)}:${(timers.w%60).toString().padStart(2,'0')}`;
        document.getElementById('black-timer').innerText = `Black: ${Math.floor(timers.b/60)}:${(timers.b%60).toString().padStart(2,'0')}`;
    }, 1000);
}

function updateCaptures() {
    const icons = { p:'♙', r:'♖', n:'♘', b:'♗', q:'♕', P:'♟', R:'♜', N:'♞', B:'♝', Q:'♛' };
    let cw = [], cb = [];
    game.history({verbose:true}).forEach(m => {
        if(m.captured) (m.color==='w'?cw:cb).push(icons[m.color==='w'?m.captured.toUpperCase():m.captured]);
    });
    document.getElementById('white-captured').innerText = cw.join(' ');
    document.getElementById('black-captured').innerText = cb.join(' ');
}

function showGameOver() { isGameOver = true; document.getElementById('game-over-modal').style.display = 'block'; }

// Init board
board = Chessboard('board', { draggable: true, position: 'start', onDrop: onDrop });

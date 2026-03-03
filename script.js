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

// 2. EVALUATION ENGINE (Material + Position)
function evaluateBoard() {
    const weights = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    let score = 0;
    game.board().forEach(row => {
        row.forEach(piece => {
            if (piece) {
                let val = weights[piece.type];
                score += (piece.color === 'w' ? val : -val);
            }
        });
    });
    
    // Normalize score for UI (0.0 to 10.0 scale)
    let displayScore = (score / 10).toFixed(1);
    let percentage = 50 + (score / 20); // Simple mapping
    percentage = Math.max(5, Math.min(95, percentage));
    
    document.getElementById('eval-bar-fill').style.height = percentage + "%";
    document.getElementById('eval-text').innerText = (displayScore > 0 ? "+" : "") + displayScore;
}

// 3. THEME & MATCHMAKING
function setTheme(theme) {
    document.body.className = '';
    if (theme !== 'default') document.body.classList.add('theme-' + theme);
    let piecePath = 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png';
    if (theme === 'glass') piecePath = 'https://raw.githubusercontent.com/shaack/cm-chessboard/master/assets/images/pieces/staunty/{piece}.svg';
    
    if(board) board.destroy();
    board = Chessboard('board', {
        draggable: true, position: game.fen(), pieceTheme: piecePath,
        onDrop: onDrop, onSnapEnd: () => board.position(game.fen())
    });
    if(myColor === 'b') board.orientation('black');
}

function startMatchmaking() {
    const statusMsg = document.getElementById('match-status');
    document.getElementById('match-btn').disabled = true;
    statusMsg.innerText = "Connecting...";

    const waitingRef = database.ref('waitingRoom');
    waitingRef.transaction((data) => {
        if (data === null) {
            roomID = "room_" + Date.now();
            return { roomID: roomID };
        } else {
            roomID = data.roomID;
            return null;
        }
    }, (err, committed) => {
        if (committed) {
            myColor = 'w';
            statusMsg.innerText = "Waiting for player...";
            database.ref('rooms/' + roomID + '/joined').on('value', (s) => { if(s.val()) initGame(); });
        } else {
            myColor = 'b';
            database.ref('rooms/' + roomID + '/joined').set(true);
            initGame();
        }
    });
}

function initGame() {
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false;
    document.getElementById('resign-btn').disabled = false;
    database.ref('rooms/' + roomID + '/game').on('value', (s) => {
        const d = s.val();
        if (d && d.fen !== game.fen()) {
            game.load(d.fen);
            timers = d.timers || timers;
            board.position(d.fen);
            updateUI(d.pgn || "");
        }
    });
}

// 4. GAME ACTIONS
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
    commitMove(source, target, 'q');
}

function commitMove(f, t, p) {
    game.move({ from: f, to: t, promotion: p });
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isGameOver) return;
        timers[game.turn()]--;
        document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`;
        document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`;
        if (timers[game.turn()] <= 0) showGameOver("Timeout");
    }, 1000);
}

function updateUI(pgn) {
    evaluateBoard();
    const list = document.getElementById('move-list');
    list.innerHTML = '';
    pgn.split(/\d+\./).filter(Boolean).forEach((m, i) => {
        const d = document.createElement('div');
        d.innerText = `${i + 1}. ${m.trim()}`;
        list.appendChild(d);
    });
    list.scrollTop = list.scrollHeight;
    if (game.game_over()) showGameOver("Game Over");
}

function selectPromotion(type) {
    document.getElementById('promotion-modal').style.display = 'none';
    commitMove(pendingMove.from, pendingMove.to, type);
    board.position(game.fen());
}

function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`; }

function downloadPGN() {
    const blob = new Blob([game.pgn()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `match_${roomID}.pgn`;
    a.click();
}

function copyPGN() {
    navigator.clipboard.writeText(game.pgn()).then(() => alert("PGN Copied!"));
}

function showGameOver(r) {
    isGameOver = true;
    clearInterval(timerInterval);
    document.getElementById('reason-text').innerText = r;
    document.getElementById('game-over-modal').style.display = 'block';
}

setTheme('glass');

const firebaseConfig = {
    apiKey: "AIzaSyCi8cZYVN6gpZRRSMx2qVHKBRRVQZmdWw4",
    authDomain: "analyticalchess.firebaseapp.com",
    databaseURL: "https://analyticalchess-default-rtdb.firebaseio.com",
    projectId: "analyticalchess",
    storageBucket: "analyticalchess.firebasestorage.app",
    messagingSenderId: "1068006653983",
    appId: "1:1068006653983:web:15ef22659ab22a3fda552a"
};
var board = null, game = new Chess(), myColor = null, roomID = null;
var soundEnabled = true, highlightEnabled = true, isGameOver = false;
var currentMoveIndex = -1, gameHistory = [], timers = { w: 600, b: 600 }, timerInterval = null;
var selectedSquare = null, pendingMove = null;

// 2. REPAIRING MATCHMAKING LOGIC
function startMatchmaking() {
    unlockAudio();
    const statusMsg = document.getElementById('match-status');
    const matchBtn = document.getElementById('match-btn');
    matchBtn.disabled = true;
    statusMsg.innerText = "Connecting to server...";

    const waitingRef = database.ref('waitingRoom');
    
    // Use transaction to ensure only one player can "take" the spot
    waitingRef.transaction((currentData) => {
        if (currentData === null) {
            // No one is waiting, I will wait.
            roomID = "room_" + Date.now();
            return { roomID: roomID, timestamp: ServerValue.TIMESTAMP };
        } else {
            // Someone is waiting, I will join them.
            roomID = currentData.roomID;
            return null; // Signals to delete the waitingRoom entry
        }
    }, (error, committed, snapshot) => {
        if (error) {
            statusMsg.innerText = "Connection error. Try again.";
            matchBtn.disabled = false;
        } else if (committed) {
            // committed = true means I am the WAITER (White player by default)
            statusMsg.innerText = "Waiting for an opponent...";
            myColor = 'w';
            database.ref('rooms/' + roomID + '/matchReady').on('value', (s) => {
                if (s.val() && s.val().joined) {
                    database.ref('rooms/' + roomID + '/matchReady').off();
                    initGame('w');
                }
            });
        } else {
            // committed = false means I am the JOINER (Black player)
            statusMsg.innerText = "Opponent found! Starting...";
            myColor = 'b';
            database.ref('rooms/' + roomID + '/matchReady').set({ joined: true });
            initGame('b');
        }
    });
}

function initGame(c) { 
    document.getElementById('setup-section').style.display = 'none'; 
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').disabled = false; 
    document.getElementById('resign-btn').disabled = false;
    
    if(c === 'b') board.orientation('black');
    
    trackPresence();
    listenToGameUpdates();
    playSound('snd-game-start');
    
    // Set initial game state if I am white
    if (c === 'w') {
        database.ref('rooms/' + roomID + '/game').set({
            fen: game.fen(),
            pgn: "",
            timers: { w: 600, b: 600 }
        });
    }
}

// 3. LOBBY LISTENER
database.ref('rooms').on('value', (snapshot) => {
    const rooms = snapshot.val();
    const list = document.getElementById('live-games-list');
    list.innerHTML = '';
    if (!rooms) { list.innerHTML = '<p style="color: #888;">No active games.</p>'; return; }

    Object.keys(rooms).forEach(id => {
        if (rooms[id].game) {
            const count = rooms[id].spectators ? Object.keys(rooms[id].spectators).length : 0;
            const item = document.createElement('div');
            item.className = 'live-game-item';
            item.innerHTML = `<span>Match ${id.slice(-4)} (${count} 👁️)</span>
                             <button style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="joinAsSpectator('${id}')">Watch</button>`;
            list.appendChild(item);
        }
    });
});

function joinAsSpectator(id) {
    unlockAudio();
    roomID = id;
    myColor = null;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('timer-area').style.visibility = 'visible';
    document.getElementById('draw-btn').style.display = 'none';
    document.getElementById('resign-btn').style.display = 'none';
    trackPresence();
    listenToGameUpdates();
}

// 4. GAME MECHANICS
function onDrop(source, target) {
    if (!myColor || isGameOver) return 'snapback';
    let move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    game.undo();
    
    let isProm = (move.color === 'w' && target[1] === '8' && move.piece === 'p') || (move.color === 'b' && target[1] === '1' && move.piece === 'p');
    if (isProm) {
        pendingMove = { from: source, to: target };
        document.getElementById('promotion-modal').style.display = 'block';
        return 'snapback';
    }
    afterMoveActions(game.move({ from: source, to: target }));
}

function selectPromotion(pType) {
    document.getElementById('promotion-modal').style.display = 'none';
    let move = game.move({ from: pendingMove.from, to: pendingMove.to, promotion: pType });
    afterMoveActions(move);
    board.position(game.fen());
}

function afterMoveActions(move) {
    if (move.captured) playSound('snd-capture');
    else if (game.in_check()) playSound('snd-check');
    else playSound('snd-move');
    database.ref('rooms/' + roomID + '/game').set({ fen: game.fen(), pgn: game.pgn(), timers: timers });
    updateGameState();
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
    updateCaptures();
    checkDrawRules();
    if (game.game_over()) showGameOver();
    else if (roomID) startTimer();
}

function checkDrawRules() {
    if (isGameOver) return;
    let reason = "";
    if (game.in_threefold_repetition()) reason = "Threefold Repetition";
    else if (game.in_draw()) {
        if (game.insufficient_material()) reason = "Insufficient Material";
        else if (game.in_stalemate()) reason = "Stalemate";
        else reason = "50-Move Rule";
    }
    if (reason) showGameOver('draw', reason);
}

// 5. CORE HELPERS
var config = { draggable: true, position: 'start', pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png', onDragStart: (s,p) => { if(isGameOver || !myColor || game.turn() !== myColor || p.search(new RegExp('^' + (myColor === 'w' ? 'b' : 'w'))) !== -1) return false; }, onDrop: onDrop, onSnapEnd: () => { board.position(game.fen()); } };
board = Chessboard('board', config);
$('#board').on('click', '.square-55d63', function() { onSquareClick($(this).attr('data-square')); });

function listenToGameUpdates() {
    database.ref('rooms/' + roomID + '/game').on('value', (s) => {
        const d = s.val();
        if (d && d.fen && d.fen !== game.fen()) {
            game.load(d.fen); if (d.timers) timers = d.timers;
            gameHistory.push(d.fen); currentMoveIndex = gameHistory.length - 1;
            board.position(d.fen); updateGameState(); updateTimerDisplay(); updateMoveList(d.pgn || "");
        }
    });
    database.ref(`rooms/${roomID}/spectators`).on('value', (s) => {
        document.getElementById('spectator-badge').style.display = 'inline-block';
        document.getElementById('spectator-count').innerText = s.val() ? Object.keys(s.val()).length : 0;
    });
}

function showGameOver(type, detail) {
    if (isGameOver) return;
    isGameOver = true; clearInterval(timerInterval); playSound('snd-game-end');
    let win = "Draw", res = detail || "Game Over";
    if (type === 'resign') { win = (detail === 'w' ? "Black" : "White") + " Wins!"; res = "Resignation"; }
    else if (type === 'timeout') { win = (detail === 'w' ? "Black" : "White") + " Wins!"; res = "Time out"; }
    else if (game.in_checkmate()) { win = (game.turn() === 'w' ? "Black" : "White") + " Wins!"; res = "Checkmate"; }
    document.getElementById('winner-text').innerText = win;
    document.getElementById('reason-text').innerText = res;
    document.getElementById('game-over-modal').style.display = 'block';
}

// REST OF UTILITIES
function updateCaptures() {
    let capturedByW = [], capturedByB = [], wScore = 0, bScore = 0;
    const icons = { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', P: '♟', R: '♜', N: '♞', B: '♝', Q: '♛' };
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    game.history({verbose: true}).forEach(m => {
        if (m.captured) {
            let v = values[m.captured];
            if (m.color === 'w') { capturedByW.push(icons[m.captured.toUpperCase()]); wScore += v; }
            else { capturedByB.push(icons[m.captured]); bScore += v; }
        }
    });
    const diff = wScore - bScore;
    document.getElementById('white-captured').innerHTML = capturedByW.join(' ') + (diff > 0 ? `<span class="score-diff">+${diff}</span>` : '');
    document.getElementById('black-captured').innerHTML = capturedByB.join(' ') + (diff < 0 ? `<span class="score-diff">+${Math.abs(diff)}</span>` : '');
}
function trackPresence() { const p = database.ref(`rooms/${roomID}/spectators`).push(); p.onDisconnect().remove(); p.set(true); }
function showLegalMoves(s) { removeGreyDots(); $('#board .square-' + s).addClass('highlight-selected'); game.moves({square:s, verbose:true}).forEach(m => $('#board .square-'+m.to).append('<span class="dot"></span>')); }
function removeGreyDots() { $('#board .square-55d63').removeClass('highlight-selected'); $('.dot').remove(); }
function unlockAudio() { ['snd-move','snd-capture','snd-check','snd-game-start','snd-game-end','snd-msg'].forEach(id => { const a = document.getElementById(id); if(a){ a.play().then(()=> { a.pause(); a.currentTime=0; }).catch(()=>{}); } }); }
function playSound(id) { if(soundEnabled) { const s = document.getElementById(id); if(s){ s.currentTime=0; s.play().catch(()=>{}); } } }
function startTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = setInterval(() => { if (!isGameOver) { timers[game.turn()]--; updateTimerDisplay(); if (timers[game.turn()] <= 0 && myColor) database.ref('rooms/' + roomID + '/status').set({ type: 'timeout', by: game.turn() }); } }, 1000); }
function updateTimerDisplay() { document.getElementById('white-timer').innerText = `White: ${formatTime(timers.w)}`; document.getElementById('black-timer').innerText = `Black: ${formatTime(timers.b)}`; }
function formatTime(s) { return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`; }
function findKing(c) { for(let r=0; r<8; r++) for(let c2=0; c2<8; c2++){ let sq = String.fromCharCode(97+c2)+(8-r); let p=game.get(sq); if(p?.type==='k' && p.color===c) return sq; } }
function toggleTheme() { document.body.classList.toggle('dark-mode'); }
function flipBoard() { board.flip(); }
function sendMessage() { const i = document.getElementById('chatInput'); if(i.value.trim() && roomID) { database.ref('rooms/'+roomID+'/chat').push({user: myColor ? (myColor==='w'?"White":"Black"):"Spectator", text: i.value}); i.value=''; } }
function displayMessage(u, t) { const b = document.getElementById('chat-messages'); const d = document.createElement('div'); d.innerHTML = `<b>${u}:</b> ${t}`; b.appendChild(d); b.scrollTop = b.scrollHeight; }
function updateMoveList(pgn) { const l = document.getElementById('move-list'); l.innerHTML = ''; pgn.split(/\d+\./).filter(Boolean).forEach((m,i) => { const d=document.createElement('div'); d.innerText=`${i+1}. ${m.trim()}`; l.appendChild(d); }); l.scrollTop=l.scrollHeight; }
function toggleHighlight() { highlightEnabled = !highlightEnabled; updateGameState(); }
function prevMove() { if (currentMoveIndex > 0) { currentMoveIndex--; board.position(gameHistory[currentMoveIndex]); } }
function nextMove() { if (currentMoveIndex < gameHistory.length - 1) { currentMoveIndex++; board.position(gameHistory[currentMoveIndex]); } }
function resignGame() { if (confirm("Resign?")) database.ref('rooms/' + roomID + '/status').set({ type: 'resign', by: myColor }); }
function offerDraw() { database.ref('rooms/' + roomID + '/status').set({ type: 'drawOffer', by: myColor }); }
function toggleFullScreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
document.getElementById('chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

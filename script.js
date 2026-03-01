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

function onDragStart (source, piece, position, orientation) {
    if (game.game_over()) return false;
    if ((myColor === 'w' && piece.search(/^b/) !== -1) ||
        (myColor === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop (source, target) {
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) return 'snapback';

    // UPDATE: Send FEN and the full History (PGN) to Firebase
    database.ref('rooms/' + roomID).set({
        fen: game.fen(),
        pgn: game.pgn() 
    });
}

function onSnapEnd () {
    board.position(game.fen());
}

var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Enter a Room ID!");
    
    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('status').innerText = "Playing as " + (color === 'w' ? "White" : "Black");
    if(color === 'b') board.orientation('black');

    database.ref('rooms/' + roomID).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.fen) {
                game.load(data.fen);
                board.position(data.fen);
            }
            // NEW: Update the visual history list
            if (data.pgn) {
                updateMoveList(data.pgn);
            }
        }
    });
}

// NEW: Function to render the move history
function updateMoveList(pgn) {
    const moveListElement = document.getElementById('move-list');
    moveListElement.innerHTML = ''; // Clear current list
    
    // Split PGN into individual moves
    const moves = pgn.split(/\d+\./).filter(Boolean);
    
    moves.forEach((movePair, index) => {
        const div = document.createElement('div');
        div.className = 'move-item';
        div.innerText = `${index + 1}. ${movePair.trim()}`;
        moveListElement.appendChild(div);
    });
    
    // Auto-scroll to bottom
    moveListElement.scrollTop = moveListElement.scrollHeight;
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
}

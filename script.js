const firebaseConfig = {
    apiKey: "AIzaSyCi8cZYVN6gpZRRSMx2qVHKBRRVQZmdWw4",
    authDomain: "analyticalchess.firebaseapp.com",
    databaseURL: "https://analyticalchess-default-rtdb.firebaseio.com",
    projectId: "analyticalchess",
    storageBucket: "analyticalchess.firebasestorage.app",
    messagingSenderId: "1068006653983",
    appId: "1:1068006653983:web:15ef22659ab22a3fda552a"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// 2. CHESS LOGIC
var board = null;
var game = new Chess();
var myColor = null;
var roomID = null;

function onDragStart (source, piece, position, orientation) {
    // PREVENT ILLEGAL MOVES:
    // Don't pick up pieces if the game is over
    if (game.game_over()) return false;

    // ONLY pick up pieces for the player's assigned color
    if ((myColor === 'w' && piece.search(/^b/) !== -1) ||
        (myColor === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }

    // ONLY pick up pieces if it is currently that color's turn
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop (source, target) {
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    });

    if (move === null) return 'snapback';

    // Send move to Firebase
    database.ref('rooms/' + roomID).set({
        fen: game.fen(),
        turn: game.turn()
    });
}

function onSnapEnd () {
    board.position(game.fen());
}

// 3. PIECE THEME FIX (Uses Wikipedia images from the web)
var config = {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd
};
board = Chessboard('board', config);

// 4. MULTIPLAYER SETUP
function joinRoom(color) {
    roomID = document.getElementById('roomInput').value;
    if (!roomID) return alert("Enter a Room ID!");
    
    myColor = color;
    document.getElementById('setup-section').style.display = 'none';
    document.getElementById('status').innerText = "Playing as " + (color === 'w' ? "White" : "Black");

    // Listen for moves from the other player
    database.ref('rooms/' + roomID).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.fen) {
            game.load(data.fen);
            board.position(data.fen);
        }
    });
}

// 5. THEME TOGGLE
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
}

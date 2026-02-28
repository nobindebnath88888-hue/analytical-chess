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
const db = firebase.database();

var board = null;
var game = new Chess();
var currentRoom = null;

function onDragStart (source, piece, position, orientation) {
    if (game.game_over() || !currentRoom) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop (source, target) {
    var move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    db.ref('rooms/' + currentRoom + '/state').set({
        fen: game.fen(),
        timestamp: Date.now()
    });
}

function joinGame() {
    currentRoom = document.getElementById('gameId').value;
    if (!currentRoom) return alert("Enter a Room ID");

    db.ref('rooms/' + currentRoom + '/state').on('value', (snap) => {
        const data = snap.val();
        if (data) {
            game.load(data.fen);
            board.position(data.fen);
            document.getElementById('status').innerText = game.turn() === 'w' ? "White's Turn" : "Black's Turn";
        }
    });

    db.ref('rooms/' + currentRoom + '/chat').limitToLast(10).on('child_added', (snap) => {
        const msg = snap.val();
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML += `<div class="msg">${msg.text}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    if (input.value && currentRoom) {
        db.ref('rooms/' + currentRoom + '/chat').push({ text: input.value });
        input.value = '';
    }
}

board = Chessboard('myBoard', {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: () => board.position(game.fen())
});

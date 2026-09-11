const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db.js');

const app = express();
const server = http.createServer(app);
// Socket.IOの初期化
const io = new Server(server, { cors: { origin: "*" } });

const PORT = Number(process.env.PORT) || 3002;
const MAX_HP = 200;
const questions_per_game = 5;
const MAX_QUESTION_LENGTH = 500;
const MAX_REFERENCE_LENGTH = 2000;

app.use(cors());
app.use(express.json());
app.use(express.static("views"));

app.get('/assets/egg-stages.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'egg-stages-transparent.png'));
});

const cleanNum = (num) => Number.isInteger(num) ? num : parseFloat(num.toFixed(4));
const parseQuestionId = value => { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; };

// --- 既存の管理画面用 API は維持 ---
const validateQuestionInput = body => {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const answer = body.answer;
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    if (!question) return { error: "問題文を入力してください。" };
    if (question.length > MAX_QUESTION_LENGTH) return { error: `問題文は${MAX_QUESTION_LENGTH}文字以内で入力してください。` };
    if (typeof answer !== 'number' || !Number.isFinite(answer)) return { error: "答えは数値で入力してください。" };
    if (reference.length > MAX_REFERENCE_LENGTH) return { error: `参考文献は${MAX_REFERENCE_LENGTH}文字以内で入力してください。` };
    return { value: { question, answer, reference } };
};

app.get('/api/questions', (req, res) => {
    res.json({ questions: db.prepare('SELECT id, question, answer, reference FROM questions ORDER BY id DESC').all() });
});
app.post('/api/questions', (req, res) => {
    const validation = validateQuestionInput(req.body || {});
    if (validation.error) return res.status(400).json({ message: validation.error });
    const { question, answer, reference } = validation.value;
    const result = db.prepare('INSERT INTO questions (question, answer, reference) VALUES (?, ?, ?)').run(question, answer, reference);
    res.status(201).json({ message: "作成しました。", question: db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid) });
});
app.put('/api/questions/:id', (req, res) => {
    const id = parseQuestionId(req.params.id);
    const validation = validateQuestionInput(req.body || {});
    if (!id || validation.error) return res.status(400).json({ message: validation.error || "ID不正" });
    const { question, answer, reference } = validation.value;
    db.prepare('UPDATE questions SET question = ?, answer = ?, reference = ? WHERE id = ?').run(question, answer, reference, id);
    res.json({ message: "更新しました。", question: db.prepare('SELECT * FROM questions WHERE id = ?').get(id) });
});
app.delete('/api/questions/:id', (req, res) => {
    const id = parseQuestionId(req.params.id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    res.json({ message: "削除しました。" });
});

// ==========================================
// Socket.IO によるリアルタイムゲームロジック
// ==========================================
const rooms = {}; // ルーム管理オブジェクト

// 4桁のランダムなルームコードを生成
function generateRoomId() {
    let id;
    do { id = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[id]);
    return id;
}

io.on('connection', (socket) => {
    // 【1】モニターがルームを作成
    socket.on('createRoom', () => {
        const roomId = generateRoomId();
        rooms[roomId] = { gameState: null };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
    });

    // 【2】コントローラーがルームに参加
    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId]) {
            socket.join(roomId);
            socket.emit('joinedRoom', roomId); // コントローラーに接続成功を通知
            io.to(roomId).emit('playerJoined'); // モニターにコントローラーの参加を通知
        } else {
            socket.emit('errorMsg', '無効な接続コードです。');
        }
    });

    // 【3】ゲームスタート
    socket.on('startGame', (roomId) => {
        if (!rooms[roomId]) return;
        const randomQuestions = db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?').all(questions_per_game);
        
        if (randomQuestions.length === 0) {
            socket.emit('errorMsg', '問題が登録されていません。管理画面から問題を作成してください。');
            return;
        }

        rooms[roomId].gameState = {
            hp: MAX_HP, currentQuestionIndex: 0, isGameOver: false, isCleared: false, questions: randomQuestions
        };

        const firstQ = randomQuestions[0];
        io.to(roomId).emit('gameStarted', {
            hp: MAX_HP, maxHp: MAX_HP,
            question: { id: firstQ.id, text: firstQ.question, reference: firstQ.reference }
        });
    });

    // 【4】解答の送信と判定
    socket.on('submitAnswer', ({ roomId, answer }) => {
        const room = rooms[roomId];
        if (!room || !room.gameState) return;

        const gs = room.gameState;
        if (gs.isGameOver || gs.isCleared) return;

        const currentQ = gs.questions[gs.currentQuestionIndex];
        const diff = cleanNum(Math.abs(answer - currentQ.answer));
        const hpLost = cleanNum(Math.min(gs.hp, diff));
        gs.hp = cleanNum(Math.max(0, gs.hp - diff));

        let response = {
            correctAnswer: currentQ.answer, difference: diff, hpLost: hpLost, remainingHp: gs.hp,
            isGameOver: false, isCleared: false
        };

        if (gs.hp === 0) {
            gs.isGameOver = true; response.isGameOver = true;
        } else {
            gs.currentQuestionIndex++;
            if (gs.currentQuestionIndex >= gs.questions.length) {
                gs.isCleared = true; response.isCleared = true;
            }
        }
        // モニターとコントローラー両方に結果をブロードキャスト
        io.to(roomId).emit('answerResult', response);
    });

    // 【5】次の問題へ
    socket.on('nextQuestion', (roomId) => {
        const room = rooms[roomId];
        if (!room || !room.gameState) return;
        const gs = room.gameState;
        const nextQ = gs.questions[gs.currentQuestionIndex];
        io.to(roomId).emit('goToNext', { id: nextQ.id, text: nextQ.question, reference: nextQ.reference });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
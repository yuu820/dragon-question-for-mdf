const express= require('express');
const cors= require('cors');
const path=require('path');
const db=require('./db.js');
const app=express();

const PORT=Number(process.env.PORT) || 3000;
const MAX_HP=200;
const questions_per_game=5;
const MAX_QUESTION_LENGTH=500;
const MAX_REFERENCE_LENGTH=2000;

app.use(cors());
app.use(express.json());
app.use(express.static("views"));
app.get('/assets/egg-stages.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'egg-stages-transparent.png'));
});

let gameState = {
        hp: MAX_HP,
        currentQuestionIndex: 0,
        isGameOver: false,
        isCleared: false,
        questions: []
    }

const publicGameState = () => ({
    hp: gameState.hp,
    maxHp: MAX_HP,
    isGameOver: gameState.isGameOver,
    isCleared: gameState.isCleared
});

const parseQuestionId = value => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};

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
    const questions = db.prepare(`
        SELECT id, question, answer, reference
        FROM questions
        ORDER BY id DESC
    `).all();
    res.json({ questions });
});

app.post('/api/questions', (req, res) => {
    const validation = validateQuestionInput(req.body || {});
    if (validation.error) return res.status(400).json({ message: validation.error });

    const { question, answer, reference } = validation.value;
    const result = db.prepare(`
        INSERT INTO questions (question, answer, reference)
        VALUES (?, ?, ?)
    `).run(question, answer, reference);
    const createdQuestion = db.prepare(`
        SELECT id, question, answer, reference FROM questions WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({ message: "問題を作成しました。", question: createdQuestion });
});

app.put('/api/questions/:id', (req, res) => {
    const id = parseQuestionId(req.params.id);
    if (!id) return res.status(400).json({ message: "問題IDが不正です。" });

    const validation = validateQuestionInput(req.body || {});
    if (validation.error) return res.status(400).json({ message: validation.error });

    const { question, answer, reference } = validation.value;
    const result = db.prepare(`
        UPDATE questions
        SET question = ?, answer = ?, reference = ?
        WHERE id = ?
    `).run(question, answer, reference, id);
    if (result.changes === 0) return res.status(404).json({ message: "指定された問題が見つかりません。" });

    const updatedQuestion = db.prepare(`
        SELECT id, question, answer, reference FROM questions WHERE id = ?
    `).get(id);
    res.json({ message: "問題を更新しました。", question: updatedQuestion });
});

app.delete('/api/questions/:id', (req, res) => {
    const id = parseQuestionId(req.params.id);
    if (!id) return res.status(400).json({ message: "問題IDが不正です。" });

    const result = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ message: "指定された問題が見つかりません。" });

    res.json({ message: "問題を削除しました。" });
});

app.post('/api/start', (req,res)=>{
    const randomQuestions = db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?').all(questions_per_game);
    if (randomQuestions.length === 0) {
        return res.status(409).json({ message: "問題が登録されていません。管理画面から問題を作成してください。" });
    }
    gameState = {
        hp: MAX_HP,
        currentQuestionIndex: 0,
        isGameOver: false,
        isCleared: false,
        questions: randomQuestions
    };
    const firstQuestion = {
        id: gameState.questions[0].id,
        text: gameState.questions[0].question,
        reference: gameState.questions[0].reference
    }

    res.json({
        message: "ゲーム スタート",
        gameState: publicGameState(),
        question: firstQuestion
    });
});

app.post('/api/answer', (req,res)=>{
    if (gameState.isGameOver||gameState.isCleared) {
        return res.status(400).json({ message: "すでにゲームは終了しました。" });
    }
    const playerAnswer = req.body.answer;
     
    if (typeof playerAnswer !== 'number' || !Number.isFinite(playerAnswer)) {
        return res.status(400).json({ message: "無効な回答です。" });
    }
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
    const correctAnswer=currentQuestion.answer;

    const difference = Math.abs(playerAnswer - correctAnswer);
    const hpLost = Math.min(gameState.hp, difference);
    gameState.hp = Math.max(0, gameState.hp - difference);

    let responseData={
        correctAnswer: correctAnswer,
        difference: difference,
        hpLost: hpLost,
        remainingHp: gameState.hp
    }
    if(gameState.hp === 0){
        gameState.isGameOver = true;
        responseData.message = "ゲームオーバー";
    }else{
        gameState.currentQuestionIndex++;
        if(gameState.currentQuestionIndex >= gameState.questions.length){
            gameState.isCleared = true;
            responseData.message = "ゲームクリア";
        }else{
            responseData.message = "次の質問に進みます";
            const nextQues= gameState.questions[gameState.currentQuestionIndex];
            responseData.nextQuestion = {
                id: nextQues.id,
                text: nextQues.question,
                reference: nextQues.reference
            };

        }
    }
    responseData.gameState = publicGameState();
    res.json(responseData);
});

app.listen(PORT);

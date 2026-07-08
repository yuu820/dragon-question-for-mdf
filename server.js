const express= require('express');
const cors= require('cors');
const Database=require("better-sqlite3");
const db=require('./db.js');
const app=express();

const PORT=3000;
const firstballoons=100;
const questions_per_game=5;

app.use(cors());
app.use(express.json());
app.use(express.static("views"));

let gameState = {
        balloons: firstballoons,
        currentQuestionIndex: 0,
        isGameOver: false,
        isCleared: false,
        questions: []
    }

app.post('/api/start', (req,res)=>{
    console.log("temp3")
    const randomQuestions = db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?').all(questions_per_game);
    gameState = {
        balloons: firstballoons,
        currentQuestionIndex: 0,
        isGameOver: false,
        isCleared: false,
        questions: randomQuestions
    };
    const firstQuestion = {
        id: gameState.questions[0].id,
        text: gameState.questions[0].question
    }

    res.json({
        message: "ゲーム スタート",
        gameState: {
            balloons:gameState.balloons,
            isGameOver: gameState.isGameOver,
            isCleared: gameState.isCleared
        },
        question: firstQuestion
    });
});

app.post('/api/answer', (req,res)=>{
    if (gameState.isGameOver||gameState.isCleared) {
        return res.status(400).json({ message: "すでにゲームは終了しました。" });
    }
    const playerAnswer = req.body.answer;
     
    if (typeof playerAnswer !== 'number') {
        return res.status(400).json({ message: "無効な回答です。" });
    }
    const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
    const correntAnswer=currentQuestion.answer;

    const difference = Math.abs(playerAnswer - correntAnswer);
    gameState.balloons -= difference;

    let responseData={
        correctAnswer: correntAnswer,
        difference: difference,
        remainingBalloons: gameState.balloons
    }
    if(gameState.balloons <= 0){
        gameState.balloons = 0;
        gameState.isGameOver = true;
        responseData.message = "ゲームオーバー";
    }else{
        gameState.currentQuestionIndex++;
        if(gameState.currentQuestionIndex >= questions_per_game){
            gameState.isCleared = true;
            responseData.message = "ゲームクリア";
        }else{
            responseData.message = "次の質問に進みます";
            const nextQues= gameState.questions[gameState.currentQuestionIndex];
            responseData.nextQuestion = {
                id: nextQues.id,
                text: nextQues.question
            };

        }
    }
    responseData.gameState = gameState;
    res.json(responseData);
});

app.listen(PORT);
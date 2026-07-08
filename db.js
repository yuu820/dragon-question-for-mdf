const Database=require("better-sqlite3");
const path=require("path");

const dbpath=path.resolve(__dirname,"questions.db");
const db=new Database(dbpath);  

db.exec(`
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer INT NOT NULL
)`);


const cot=db.prepare('SELECT COUNT(*) AS count FROM questions').get().count;
if (cot === 0) {
    const insert = db.prepare('INSERT INTO questions (question, answer) VALUES (?, ?)');

    const many=db.transaction((questions)=>{
        for (const question of questions) insert.run(question.question, question.answer);
    });
    many([
        { question: "5 + 3", answer: 8 },
        { question: "10 - 4", answer: 6 },
        { question: "7 * 2", answer: 14 },
        { question: "12 / 3", answer: 4 },
        { question: "15 + 5", answer: 20 },
        { question: "9 - 2", answer: 7 },
        { question: "6 * 3", answer: 18 },
        { question: "20 / 4", answer: 5 },
        { question: "8 + 6", answer: 14 },
        { question: "11 - 7", answer: 4 }
    ]);
}
module.exports = db;


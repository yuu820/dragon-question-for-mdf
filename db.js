const Database=require("better-sqlite3");
const path=require("path");

const dbpath=process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname,"questions.db");
const db=new Database(dbpath);  

db.exec(`
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer INT NOT NULL,
    reference TEXT NOT NULL DEFAULT ''
)`);

const questionColumns=db.prepare('PRAGMA table_info(questions)').all();
if (!questionColumns.some(column => column.name === 'reference')) {
    db.exec("ALTER TABLE questions ADD COLUMN reference TEXT NOT NULL DEFAULT ''");
}

const cot=db.prepare('SELECT COUNT(*) AS count FROM questions').get().count;
if (cot === 0) {
    const insert = db.prepare('INSERT INTO questions (question, answer, reference) VALUES (?, ?, ?)');

    const many=db.transaction((questions)=>{
        for (const question of questions) insert.run(question.question, question.answer, question.reference);
    });
    many([
        { question: "5 + 3", answer: 8, reference: "基礎算数：たし算" },
        { question: "10 - 4", answer: 6, reference: "基礎算数：ひき算" },
        { question: "7 * 2", answer: 14, reference: "基礎算数：かけ算" },
        { question: "12 / 3", answer: 4, reference: "基礎算数：わり算" },
        { question: "15 + 5", answer: 20, reference: "基礎算数：たし算" },
        { question: "9 - 2", answer: 7, reference: "基礎算数：ひき算" },
        { question: "6 * 3", answer: 18, reference: "基礎算数：かけ算" },
        { question: "20 / 4", answer: 5, reference: "基礎算数：わり算" },
        { question: "8 + 6", answer: 14, reference: "基礎算数：たし算" },
        { question: "11 - 7", answer: 4, reference: "基礎算数：ひき算" }
    ]);
}
module.exports = db;

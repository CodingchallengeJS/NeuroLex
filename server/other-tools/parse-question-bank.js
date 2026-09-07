const fs = require('fs');
const path = require('path');

function convertRawTextToJSON(rawText) {
    let cleanText = rawText
        .replace(/VietAccepted Center - GMAT \| IELTS \| Du học/g, "")
        .replace(/440 Vocabulary Questions/g, "")
        .replace(/\s*--- PAGE \d+ ---\s*\d+\s*/g, " ") // Đã fix dòng này
        .trim();

    const splitData = cleanText.split("Answer Key");
    const questionsPart = splitData[0];
    const answersPart = splitData.length > 1 ? splitData[1] : "";

    const answerMap = {};
    if (answersPart) {
        const answerMatches = answersPart.matchAll(/(\d{3})\s+([A-E])/g);
        for (const match of answerMatches) {
            answerMap[match[1]] = match[2];
        }
    }

    const jsonResult = [];
    const questionBlocks = questionsPart.split(/(?=\b\d{3}\.\s)/).filter(block => block.trim() !== "");

    questionBlocks.forEach(block => {
        const idMatch = block.match(/^(\d{3})\.\s/);
        if (!idMatch) return;

        const questionId = idMatch[1];
        let content = block.substring(idMatch[0].length).trim();
        const optionsRegex = /\(A\)\s*([\s\S]+?)\s*\(B\)\s*([\s\S]+?)\s*\(C\)\s*([\s\S]+?)\s*\(D\)\s*([\s\S]+?)$/;
        const optionsMatch = content.match(optionsRegex);

        let questionText = content;
        let optionsObj = {};

        if (optionsMatch) {
            questionText = content.replace(optionsMatch[0], "").trim();
            optionsObj = {
                "A": optionsMatch[1].replace(/\n/g, " ").trim(),
                "B": optionsMatch[2].replace(/\n/g, " ").trim(),
                "C": optionsMatch[3].replace(/\n/g, " ").trim(),
                "D": optionsMatch[4].replace(/\n/g, " ").trim()
            };
        }

        // Collapse newlines FIRST: the source text wraps mid-phrase, so
        // "closest in\nmeaning" would otherwise fail the check below and be
        // misfiled as a general question.
        questionText = questionText.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();

        let questionType = "general";
        if (questionText.toLowerCase().includes("closest in meaning")) {
            questionType = "vocabulary";
        }

        jsonResult.push({
            id: parseInt(questionId, 10),
            question: questionText,
            type: questionType,
            options: optionsObj,
            answer: answerMap[questionId] || null
        });
    });

    return JSON.stringify(jsonResult, null, 2);
}

function executeParser() {
    const inputFilePath = path.join(__dirname, '../assets/440-wic-question.txt');
    const outputFilePath = path.join(__dirname, '../assets/440-wic-question.json');

    try {
        console.log("Khởi chạy tiến trình đọc tệp tin...");
        const rawText = fs.readFileSync(inputFilePath, 'utf8');

        console.log("Đang tiến hành phân rã và cấu trúc hóa dữ liệu...");
        const jsonData = convertRawTextToJSON(rawText);
        
        fs.writeFileSync(outputFilePath, jsonData, 'utf8');

        const parsed = JSON.parse(jsonData);
        const noOptions = parsed.filter((q) => !q.options || Object.keys(q.options).length === 0);
        const noAnswer = parsed.filter((q) => !q.answer);
        const byType = parsed.reduce((acc, q) => { acc[q.type] = (acc[q.type] || 0) + 1; return acc; }, {});

        console.log('\nParsed ' + parsed.length + ' questions: ' +
            Object.entries(byType).map(([k, v]) => k + '=' + v).join(', '));
        if (noOptions.length > 0) {
            console.log('WARN  ' + noOptions.length + ' question(s) have no options and cannot be answered: ' +
                noOptions.map((q) => q.id).join(', '));
        }
        if (noAnswer.length > 0) {
            console.log('WARN  ' + noAnswer.length + ' question(s) have no answer key: ' +
                noAnswer.map((q) => q.id).join(', '));
        }
        if (noOptions.length || noAnswer.length) {
            console.log('      import-question-bank.js skips these rather than importing them broken.');
        }

        console.log(`\nTiến trình hoàn tất thành công. Dữ liệu đầu ra được lưu tại: ${outputFilePath}`);
    } catch (error) {
        console.error("Lỗi ngoại lệ trong quá trình thực thi:", error.message);
    }
}

executeParser();
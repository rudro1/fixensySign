const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');

const app = express();

// Manual CORS Settings for Render & Vercel
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const UPLOAD_DIR = path.join(__dirname, 'upload');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { 
        user: 'bisalsaha42@gmail.com', 
        pass: 'mheljgawhmhadbkc' 
    },
    tls: { rejectUnauthorized: false }
});

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.post('/upload-pdf', upload.single('pdfFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    res.json({ pdfPath: req.file.filename });
});

app.post('/generate-link', (req, res) => {
    const { pdfPath, signs } = req.body;
    const id = "doc-" + Date.now();
    const db = loadDB();
    db[id] = { pdfPath, signs };
    saveDB(db);
    res.json({ id: id });
});

app.get('/doc/:id', (req, res) => {
    const db = loadDB();
    const data = db[req.params.id];
    data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

app.post('/submit-sign/:id', async (req, res) => {
    console.log(`Processing: ${req.params.id}`);
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        
        if (!docData) return res.status(404).json({ error: "Document ID not found" });

        const filePath = path.join(UPLOAD_DIR, docData.pdfPath);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "PDF file deleted. Please re-upload." });

        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < docData.signs.length; i++) {
            const mark = docData.signs[i];
            const signature = signatureImages[i];
            if (!signature) continue;

            const pageNum = mark.page - 1;
            const page = pages[pageNum];
            const { width: pdfW, height: pdfH } = page.getSize();
            const ratio = pdfW / 800;

            const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
            const imgBytes = Buffer.from(base64, 'base64');
            const image = await pdfDoc.embedPng(imgBytes);

            const sW = 150 * ratio;
            const sH = 60 * ratio;
            const xPos = (mark.x / 100) * pdfW;
            const yPos = pdfH - ((mark.y / 100) * pdfH);

            page.drawImage(image, {
                x: xPos - (sW / 2),
                y: yPos - (sH / 2),
                width: sW,
                height: sH
            });
        }

        const signedPdfBytes = await pdfDoc.save();
        const pdfBuffer = Buffer.from(signedPdfBytes);
        
        // Email async pathano hochche jate processing stuck na hoy
        transporter.sendMail({
            from: '"Fixen Sign" <bisalsaha42@gmail.com>',
            to: 'bisalsaha42@gmail.com',
            subject: `Signed: ${req.params.id}`,
            attachments: [{ filename: 'SignedDoc.pdf', content: pdfBuffer }]
        }).catch(e => console.error("Mail Error:", e.message));

        res.json({ pdf: pdfBuffer.toString('base64') });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Processing failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Live`));
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;

const app = express();

// Cloudinary Config - Apnar dashboard theke milie nite hobe
cloudinary.config({ 
  cloud_name: 'dqz7y6t6n', 
  api_key: '235218764267673', 
  api_secret: 'vB97R93T_t0z7qW8r7yQW8u9I' 
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'bisalsaha42@gmail.com', pass: 'mheljgawhmhadbkc' }
});

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Step 1: Upload Fix with Debugging
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });
        
        console.log("Uploading to Cloudinary...");
        const result = await cloudinary.uploader.upload(req.file.path, { resource_type: "raw" });
        
        // Local file remove kora (storage bachaner jonno)
        fs.unlinkSync(req.file.path); 
        
        res.json({ pdfPath: result.secure_url }); 
    } catch (error) {
        console.error("Cloudinary Error:", error.message);
        res.status(500).json({ error: "Cloudinary upload failed: " + error.message });
    }
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
    if (data) return res.json(data);
    res.status(404).json({ error: "Document ID not found in database." });
});

app.post('/submit-sign/:id', async (req, res) => {
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        
        if (!docData) return res.status(404).json({ error: "ID missing" });

        // Cloudinary theke fetch (Axios ba Fetch install kora dorkar)
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const response = await fetch(docData.pdfPath);
        const pdfBytes = await response.arrayBuffer();
        
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

            page.drawImage(image, {
                x: (mark.x / 100) * pdfW - (75 * ratio),
                y: pdfH - ((mark.y / 100) * pdfH) - (30 * ratio),
                width: 150 * ratio,
                height: 60 * ratio
            });
        }

        const signedPdfBytes = await pdfDoc.save();
        const pdfBuffer = Buffer.from(signedPdfBytes);
        
        transporter.sendMail({
            from: 'bisalsaha42@gmail.com',
            to: 'bisalsaha42@gmail.com',
            subject: `Signed: ${req.params.id}`,
            attachments: [{ filename: 'Signed.pdf', content: pdfBuffer }]
        }).catch(e => console.log("Mail Error"));

        res.json({ pdf: pdfBuffer.toString('base64') });
    } catch (error) {
        console.error("Submit Sign Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready on ${PORT}`));
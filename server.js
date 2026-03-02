const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;

const app = express();

cloudinary.config({ 
  cloud_name: 'dk9v5b3zj', 
  api_key: '127163864988358', 
  api_secret: 'IquS9tGoWFSJGeRa76inMOyXK7E' 
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

app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file" });
        const result = await cloudinary.uploader.upload(req.file.path, { resource_type: "auto" });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
        
        // Shudhu Cloudinary URL-ti pathachhi
        res.json({ pdfPath: result.secure_url }); 
    } catch (error) {
        res.status(500).json({ error: "Cloudinary failed: " + error.message });
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
    // Ekhane absolute URL nishchit kora hochche
    data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

app.post('/submit-sign/:id', async (req, res) => {
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        if (!docData) return res.status(404).json({ error: "ID missing" });

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
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready`));
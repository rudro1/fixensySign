const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;

const app = express();

// 🛑 CLOUDINARY CONFIG
cloudinary.config({ 
  cloud_name: 'dxbpamnhh', 
  api_key: '139816973735674', 
  api_secret: '0V4H5KqC-YPpHi5ZJogC_41-Eeg' 
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

// 🛑 GMAIL SMTP CONFIG (FORCE IPv4 HOST)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: 'bisalsaha42@gmail.com', pass: 'mheljgawhmhadbkc' }
});

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file" });
        const result = await cloudinary.uploader.upload(req.file.path, { resource_type: "auto" });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
        res.json({ pdfPath: result.secure_url }); 
    } catch (error) {
        res.status(500).json({ error: "Upload failed: " + error.message });
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
    data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

// 🚀 FIXED SUBMIT LOGIC (NO MORE STUCK ON PROCESSING)
app.post('/submit-sign/:id', async (req, res) => {
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        if (!docData) return res.status(404).json({ error: "ID missing" });

        // Step 1: Fetch PDF from Cloudinary
        const response = await axios.get(docData.pdfPath, { responseType: 'arraybuffer' });
        const pdfDoc = await PDFDocument.load(response.data);
        const pages = pdfDoc.getPages();

        // Step 2: Draw Signatures
        for (let i = 0; i < docData.signs.length; i++) {
            const mark = docData.signs[i];
            const signature = signatureImages[i];
            if (!signature) continue;

            const page = pages[mark.page - 1];
            const { width: pdfW, height: pdfH } = page.getSize();
            const ratio = pdfW / 800;

            const imgBytes = Buffer.from(signature.split(',')[1], 'base64');
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

        // 🛑 ASYNC MAIL (DO NOT AWAIT - PREVENTS ENETUNREACH STUCK)
        transporter.sendMail({
            from: 'bisalsaha42@gmail.com',
            to: 'bisalsaha42@gmail.com',
            subject: `Signed: ${req.params.id}`,
            attachments: [{ filename: 'Signed.pdf', content: pdfBuffer }]
        }).catch(err => console.log("Mail network error ignored."));

        // Step 3: Return PDF to User Immediately
        res.json({ pdf: pdfBuffer.toString('base64') });

    } catch (error) {
        console.error("Critical Error:", error.message);
        res.status(500).json({ error: "Error: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server Ready`));
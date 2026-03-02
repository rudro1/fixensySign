const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const UPLOAD_DIR = path.join(__dirname, 'upload');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/upload', express.static(UPLOAD_DIR));

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

// Email Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: 'bisalsaha42@gmail.com', 
        pass: 'mheljgawhmhadbkc'  // ⚠️ MUST BE APP PASSWORD!
    }
});

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Upload PDF
app.post('/upload-pdf', upload.single('pdfFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    res.json({ pdfPath: req.file.filename });
});

// Generate Link
app.post('/generate-link', (req, res) => {
    const { pdfPath, signs } = req.body;
    const id = "doc-" + Date.now();
    const db = loadDB();
    db[id] = { pdfPath, signs };
    saveDB(db);
    res.json({ id: id });
});

// Get Doc
app.get('/doc/:id', (req, res) => {
    const db = loadDB();
    const data = db[req.params.id];
    data ? res.json(data) : res.status(404).json({ error: "Link Expired" });
});

// Submit Signature + Send Email
app.post('/submit-sign/:id', async (req, res) => {
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        
        if (!docData) return res.status(404).json({ error: "Data missing" });

        const filePath = path.join(UPLOAD_DIR, docData.pdfPath);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

        const pdfBytes = fs.readFileSync(filePath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // Add signatures
        for (let i = 0; i < docData.signs.length; i++) {
            const mark = docData.signs[i];
            const signature = signatureImages[i];
            if (!signature) continue;

            const pageNum = mark.page - 1;
            const page = pages[pageNum];
            if (!page) continue;

            const { width: pdfW, height: pdfH } = page.getSize();
            const ratio = pdfW / 800;

            const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
            const imgBytes = Buffer.from(base64, 'base64');
            
            let image;
            try {
                image = await pdfDoc.embedPng(imgBytes);
            } catch {
                image = await pdfDoc.embedJpg(imgBytes);
            }

            page.drawImage(image, {
                x: (mark.x / 100) * pdfW - (75 * ratio),
                y: pdfH - ((mark.y / 100) * pdfH) - (30 * ratio),
                width: 150 * ratio,
                height: 60 * ratio
            });
        }

        const signedPdfBytes = await pdfDoc.save();
        
        // 📧 SEND EMAIL - Wait for it!
        const mailOptions = {
            from: '"Fixensy" <bisalsaha42@gmail.com>',
            to: 'bisalsaha42@gmail.com',
            subject: `✅ Signed Document - ${req.params.id}`,
            text: 'Your document has been signed. Find the attached PDF below.',
            html: `
                <h2>Document Signed Successfully!</h2>
                <p>Your signed PDF is attached to this email.</p>
                <p>Document ID: ${req.params.id}</p>
                <br/>
                <p>Powered by <strong>Fixensy</strong></p>
            `,
            attachments: [{
                filename: `Signed_${req.params.id}.pdf`,
                content: Buffer.from(signedPdfBytes)
            }]
        };

        // Wait for email to send
        await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully!");

        // Send response
        res.json({ 
            pdf: Buffer.from(signedPdfBytes).toString('base64'),
            message: "Signed and emailed!"
        });
        
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend'); // Resend ইমপোর্ট

const app = express();

// ✅ Resend API Key এখানে
const resend = new Resend('re_h6FrUVZj_KQfUUaPkVGSUVAvFL7vJeJfE');

cloudinary.config({ 
  cloud_name: 'dxbpamnhh', 
  api_key: '139816973735674', 
  api_secret: '0V4H5KqC-YPpHi5ZJogC_41-Eeg' 
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file" });
        const result = await cloudinary.uploader.upload(req.file.path, { resource_type: "auto" });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); 
        res.json({ pdfPath: result.secure_url }); 
    } catch (error) {
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
    data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

app.post('/submit-sign/:id', async (req, res) => {
    let pdfBuffer = null;

    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        if (!docData) return res.status(404).json({ error: "ID missing" });

        // PDF প্রসেসিং
        const response = await axios.get(docData.pdfPath, { responseType: 'arraybuffer' });
        const pdfBytes = response.data;
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
        pdfBuffer = Buffer.from(signedPdfBytes);

        // ✅ Resend দিয়ে ইমেইল পাঠানো
        let emailStatus = "sent";
        try {
            const data = await resend.emails.send({
                from: 'Signer App <onboarding@resend.dev>',
                to: 'bisalsaha42@gmail.com',
                subject: `Signed Document: ${req.params.id}`,
                attachments: [
                    {
                        filename: 'Signed.pdf',
                        content: pdfBuffer.toString('base64'),
                    },
                ],
            });
            console.log("Email sent:", data);
        } catch (mailError) {
            console.error("EMAIL ERROR:", mailError.message);
            emailStatus = "failed";
        }

        res.json({ 
            pdf: pdfBuffer.toString('base64'), 
            emailStatus: emailStatus 
        });

    } catch (error) {
        console.error("Fatal Error:", error.message);
        res.status(500).json({ error: "Processing failed: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready with Resend`));
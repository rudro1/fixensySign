const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const cloudinary = require('cloudinary').v2;
const { Resend } = require('resend');

const app = express();

// ✅ Resend API Key
const resend = new Resend('re_h6FrUVZj_KQfUUaPkVGSUVAvFL7vJeJfE');

// ক্লাউডিনারি কনফিগ
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

// ১. পিডিএফ আপলোড
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

// ২. লিংক জেনারেট
app.post('/generate-link', (req, res) => {
    const { pdfPath, signs } = req.body;
    const id = "doc-" + Date.now();
    const db = loadDB();
    db[id] = { pdfPath, signs };
    saveDB(db);
    res.json({ id: id });
});

// ৩. ডক ডাটা পাওয়া
app.get('/doc/:id', (req, res) => {
    const db = loadDB();
    const data = db[req.params.id];
    data ? res.json(data) : res.status(404).json({ error: "Not found" });
});

// ৪. সাইন সাবমিট এবং ইমেইল পাঠানো
app.post('/submit-sign/:id', async (req, res) => {
    let pdfBuffer = null;

    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        if (!docData) return res.status(404).json({ error: "ID missing" });

        // পিডিএফ প্রসেসিং
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

        // ✅ রিসেন্ড দিয়ে ইমেইল (ফিক্স করা হয়েছে)
        const { data, error } = await resend.emails.send({
            from: 'Signer <onboarding@resend.dev>',
            to: 'bisalsaha42@gmail.com',
            subject: 'Signed Document',
            text: 'Please find the attached signed PDF document.', // এটা যোগ করা হয়েছে
            attachments: [
                {
                    filename: 'signed.pdf',
                    content: pdfBuffer.toString('base64'),
                },
            ],
        });

        if (error) {
            console.log("Resend Error:", error);
            return res.status(500).json({ error: error.message });
        }

        console.log("Email sent:", data);

        // ইউজার কে রেসপন্স পাঠানো
        res.json({ 
            pdf: pdfBuffer.toString('base64'), 
            emailStatus: 'sent' 
        });

    } catch (error) {
        console.error("Fatal Error:", error.message);
        res.status(500).json({ error: "Processing failed: " + error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Ready`));
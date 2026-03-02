// const express = require('express');
// const multer = require('multer');
// const cors = require('cors');
// const fs = require('fs');
// const { PDFDocument } = require('pdf-lib');
// const nodemailer = require('nodemailer');

// const app = express();
// app.use(cors());
// app.use(express.json({ limit: '50mb' }));
// app.use('/upload', express.static('upload'));

// if (!fs.existsSync('./upload')) {
//     fs.mkdirSync('./upload', { recursive: true });
// }

// const upload = multer({ dest: 'upload/' });
// const DB_FILE = './database.json';

// const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: { 
//         user: 'bisalsaha42@gmail.com', 
//         pass: 'mheljgawhmhadbkc'
//     }
// });

// const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
// const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// // 1. PDF Upload
// app.post('/upload-pdf', upload.single('pdfFile'), (req, res) => {
//     if (!req.file) return res.status(400).send({ error: "No file" });
//     res.send({ pdfPath: req.file.filename });
// });

// // 2. Generate Link with marks
// app.post('/generate-link', (req, res) => {
//     const { pdfPath, signs } = req.body;
//     const id = "doc-" + Date.now();
//     const db = loadDB();
//     db[id] = { pdfPath, signs };
//     saveDB(db);
//     res.send({ id: id });
// });

// // 3. Get Document
// app.get('/doc/:id', (req, res) => {
//     const db = loadDB();
//     const data = db[req.params.id];
//     data ? res.send(data) : res.status(404).send({ error: "Not found" });
// });

// // 4. Submit Signature - ONLY on marked page & position
// app.post('/submit-sign/:id', async (req, res) => {
//     try {
//         const { signatureImages } = req.body;
//         const db = loadDB();
//         const docData = db[req.params.id];
        
//         if (!docData) return res.status(404).send({ error: "Document not found" });

//         // Load PDF
//         const pdfBytes = fs.readFileSync(`./upload/${docData.pdfPath}`);
//         const pdfDoc = await PDFDocument.load(pdfBytes);
//         const pages = pdfDoc.getPages();

//         console.log("=== SIGNING PROCESS ===");
//         console.log("Marks:", JSON.stringify(docData.signs));
        
//         // Loop through each mark
//         for (let i = 0; i < docData.signs.length; i++) {
//             const mark = docData.signs[i];
//             const signature = signatureImages[i];
            
//             if (!signature) {
//                 console.log(`Skipping mark ${i} - no signature`);
//                 continue;
//             }

//             console.log(`\nProcessing mark ${i}:`);
//             console.log(`  Page: ${mark.page}`);
//             console.log(`  Position: x=${mark.x}%, y=${mark.y}%`);

//             // Get the SPECIFIC page (1-based to 0-based)
//             const pageNum = mark.page - 1;
            
//             if (pageNum < 0 || pageNum >= pages.length) {
//                 console.log(`  ❌ Invalid page number: ${mark.page}`);
//                 continue;
//             }

//             const page = pages[pageNum];
//             const { width, height } = page.getSize();

//             console.log(`  Page size: ${width} x ${height}`);

//             // Convert base64 to image
//             const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
//             const imgBytes = Buffer.from(base64, 'base64');
            
//             let image;
//             try {
//                 image = await pdfDoc.embedPng(imgBytes);
//             } catch {
//                 try {
//                     image = await pdfDoc.embedJpg(imgBytes);
//                 } catch {
//                     console.log(`  ❌ Failed to embed image`);
//                     continue;
//                 }
//             }

//             // Signature size (fixed size, will scale)
//             const sigWidth = 150;
//             const sigHeight = 60;
            
//             // Calculate position
//             // x = percentage of page width
//             const xPos = (mark.x / 100) * width;
            
//             // y = percentage of page height (PDF coords start from bottom)
//             const yPos = height - ((mark.y / 100) * height);

//             console.log(`  Final position: x=${xPos.toFixed(1)}, y=${yPos.toFixed(1)}`);

//             // Draw signature ONLY on this specific page
//             page.drawImage(image, {
//                 x: xPos - (sigWidth / 2),
//                 y: yPos - (sigHeight / 2),
//                 width: sigWidth,
//                 height: sigHeight
//             });
            
//             console.log(`  ✅ Signature added to page ${mark.page}`);
//         }

//         // Save and send
//         const signedPdfBytes = await pdfDoc.save();
        
//         // Email
//         try {
//             await transporter.sendMail({
//                 from: 'bisalsaha42@gmail.com',
//                 to: 'bisalsaha42@gmail.com',
//                 subject: `Signed PDF - ${req.params.id}`,
//                 attachments: [{
//                     filename: 'signed.pdf',
//                     content: Buffer.from(signedPdfBytes)
//                 }]
//             });
//             console.log("\n✅ Email sent!");
//         } catch (e) {
//             console.log("\n❌ Email failed:", e.message);
//         }

//         res.send({ 
//             pdf: Buffer.from(signedPdfBytes).toString('base64')
//         });

//     } catch (error) {
//         console.error("Error:", error);
//         res.status(500).send({ error: error.message });
//     }
// });

// app.listen(3000, '0.0.0.0', () => console.log('Server: http://localhost:3000'));

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/upload', express.static('upload'));

if (!fs.existsSync('./upload')) {
    fs.mkdirSync('./upload', { recursive: true });
}

const upload = multer({ dest: 'upload/' });
const DB_FILE = './database.json';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
        user: 'bisalsaha42@gmail.com', 
        pass: 'mheljgawhmhadbkc'
    }
});

const loadDB = () => fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

app.post('/upload-pdf', upload.single('pdfFile'), (req, res) => {
    if (!req.file) return res.status(400).send({ error: "No file" });
    res.send({ pdfPath: req.file.filename });
});

app.post('/generate-link', (req, res) => {
    const { pdfPath, signs } = req.body;
    const id = "doc-" + Date.now();
    const db = loadDB();
    db[id] = { pdfPath, signs };
    saveDB(db);
    res.send({ id: id });
});

app.get('/doc/:id', (req, res) => {
    const db = loadDB();
    const data = db[req.params.id];
    data ? res.send(data) : res.status(404).send({ error: "Not found" });
});

app.post('/submit-sign/:id', async (req, res) => {
    try {
        const { signatureImages } = req.body;
        const db = loadDB();
        const docData = db[req.params.id];
        
        if (!docData) return res.status(404).send({ error: "Document not found" });

        const pdfBytes = fs.readFileSync(`./upload/${docData.pdfPath}`);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        for (let i = 0; i < docData.signs.length; i++) {
            const mark = docData.signs[i];
            const signature = signatureImages[i];
            
            if (!signature) continue;

            const pageNum = mark.page - 1;
            if (pageNum < 0 || pageNum >= pages.length) continue;

            const page = pages[pageNum];
            const { width: pdfW, height: pdfH } = page.getSize();

            // FIXED: Ratio calculation for 800px frontend width
            const ratio = pdfW / 800;

            const base64 = signature.replace(/^data:image\/\w+;base64,/, '');
            const imgBytes = Buffer.from(base64, 'base64');
            const image = await pdfDoc.embedPng(imgBytes);

            const sW = 150 * ratio;
            const sH = 60 * ratio;

            // FIXED: Precise coordinate mapping
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
        
        await transporter.sendMail({
            from: 'bisalsaha42@gmail.com',
            to: 'bisalsaha42@gmail.com',
            subject: `Signed PDF - ${req.params.id}`,
            attachments: [{ filename: 'signed.pdf', content: Buffer.from(signedPdfBytes) }]
        });

        res.send({ pdf: Buffer.from(signedPdfBytes).toString('base64') });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// FIXED: Use process.env.PORT for deployment
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
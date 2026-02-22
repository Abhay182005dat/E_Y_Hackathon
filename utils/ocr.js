"use strict";

/**
 * OCR Module - Document parsing with Tesseract.js + PDF support
 * No external binaries required
 */
const Tesseract = require('tesseract.js');
const stringSimilarity = require('string-similarity');
const fs = require('fs');
const path = require('path');
const pdfPoppler = require('pdf-poppler');
const { Jimp } = require('jimp');

/**
 * Universal OCR function handling Images and PDFs (Text & Scanned)
 * @param {Buffer|string} fileBufferOrPath - File buffer or path
 * @param {string} mimeType - 'application/pdf' or image mime type (optional if path provided)
 */
async function performOCR(fileBufferOrPath, mimeType) {
    let filePath = fileBufferOrPath;
    let cleanup = false;

    // maintain temp file if buffer provided
    if (Buffer.isBuffer(fileBufferOrPath)) {
        const ext = mimeType === 'application/pdf' ? '.pdf' : '.png';
        filePath = path.join(__dirname, `../uploads/temp_ocr_${Date.now()}${ext}`);
        fs.writeFileSync(filePath, fileBufferOrPath);
        cleanup = true;
    }

    try {
        console.log(`[OCR] Starting processing for: ${filePath}`);
        let text = '';

        if (filePath.toLowerCase().endsWith('.pdf')) {
            // Try text extraction first
            text = await extractPdfText(filePath);

            // If text extraction yielded little result (< 50 chars), try scanned pipeline
            if (!text || text.length < 50 || text.includes('[SCANNED_PDF')) {
                console.log('[OCR] PDF appears to be scanned. Converting to images...');

                const outputDir = path.dirname(filePath);
                const opts = {
                    format: 'png',
                    out_dir: outputDir,
                    out_prefix: path.basename(filePath, path.extname(filePath)),
                    page: null // all pages
                };

                try {
                    await pdfPoppler.convert(filePath, opts);

                    // Find generated images
                    const files = fs.readdirSync(outputDir).filter(f =>
                        f.startsWith(opts.out_prefix) && f.endsWith('.png')
                    );

                    console.log(`[OCR] Converted PDF to ${files.length} images. Running OCR...`);

                    for (const file of files) {
                        const imgPath = path.join(outputDir, file);
                        const pageText = await ocrImage(imgPath);
                        text += `\n--- Page ${file} ---\n` + pageText;

                        // Cleanup image
                        fs.unlinkSync(imgPath);
                    }
                } catch (pdfErr) {
                    console.error('[OCR] PDF conversion failed:', pdfErr.message);
                    // Fallback to what we had (maybe empty)
                }
            }
        } else {
            // Standard image OCR
            text = await ocrImage(filePath);
        }

        return text;

    } catch (err) {
        console.error('[OCR] Critical error:', err);
        throw err;
    } finally {
        if (cleanup && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

// ==================== PDF TEXT EXTRACTION ====================

const PDFParser = require('pdf2json');

/**
 * Extract text from PDF files.
 * Works with:
 * - Digital/text-based PDFs (bank statements from portals, system-generated PDFs)
 * 
 * For scanned PDFs (image-based):
 * - The function returns empty string
 * - User should upload as JPG/PNG for OCR
 */
async function extractPdfText(pdfPath) {
    const fileName = path.basename(pdfPath);
    console.log('📄 [PDF] Processing:', fileName);

    return new Promise((resolve) => {
        const pdfParser = new PDFParser();

        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
            console.log('   ⏱️  PDF parsing timeout - file may be corrupted or too large');
            resolve('');
        }, 30000);

        pdfParser.on('pdfParser_dataError', (errData) => {
            clearTimeout(timeout);
            console.error('   ❌ PDF parsing error:', errData.parserError);
            resolve('');
        });

        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            clearTimeout(timeout);
            try {
                let fullText = '';
                let pageCount = 0;

                if (pdfData && pdfData.Pages) {
                    pageCount = pdfData.Pages.length;

                    for (const page of pdfData.Pages) {
                        if (page.Texts) {
                            for (const textItem of page.Texts) {
                                if (textItem.R) {
                                    for (const run of textItem.R) {
                                        if (run.T) {
                                            const decoded = decodeURIComponent(run.T);
                                            fullText += decoded + ' ';
                                        }
                                    }
                                }
                            }
                            fullText += '\n';
                        }
                    }
                }

                const cleanText = fullText.trim();
                console.log(`   📑 Pages: ${pageCount}`);

                if (cleanText.length === 0) {
                    console.log('   ⚠️  This is a SCANNED PDF (no text layer)');
                    console.log('   💡 For OCR, please upload as IMAGE (JPG/PNG)');
                    // Return a placeholder to indicate PDF was processed
                    resolve('[SCANNED_PDF:' + fileName + ']');
                } else {
                    console.log(`   ✅ Extracted: ${cleanText.length} characters`);
                    // Log preview of extracted text
                    const preview = cleanText.substring(0, 100).replace(/\n/g, ' ');
                    console.log(`   📝 Preview: "${preview}..."`);
                    resolve(cleanText);
                }
            } catch (err) {
                console.error('   ❌ Text extraction error:', err.message);
                resolve('');
            }
        });

        pdfParser.loadPDF(pdfPath);
    });
}

// ==================== IMAGE PREPROCESSING ====================

/**
 * Preprocess image for better OCR results
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Buffer>} - Processed image buffer
 */
async function preprocessImage(buffer) {
    try {
        const image = await Jimp.read(buffer);

        // Resize if too small (width < 1000px)
        if (image.bitmap.width < 1000) {
            image.resize({ w: 1000 });
        }

        // Apply filters: Greyscale -> Contrast -> Normalize
        image
            .greyscale()
            .contrast(0.5) // Increase contrast significantly
            .normalize();

        // Optional: Binarize if needed, but contrast usually helps enough
        // image.threshold({ max: 255 });

        console.log('   Getting buffer (via Base64)...');
        // Use getBase64 as getBuffer seems to hang in this environment
        const base64 = await image.getBase64('image/png');
        const base64Data = base64.replace(/^data:image\/png;base64,/, "");
        const finalBuffer = Buffer.from(base64Data, 'base64');

        console.log('   Buffer obtained. Length:', finalBuffer.length);
        return finalBuffer;

    } catch (err) {
        console.error('⚠️ [OCR] Preprocessing failed:', err);
        return buffer; // Return original if processing fails
    }
}

// ==================== OCR ENGINE ====================

async function ocrImage(imagePathOrBuffer, langs = ['eng']) {
    const langTag = Array.isArray(langs) ? langs.join('+') : langs;

    let buffer = imagePathOrBuffer;
    const fileName = typeof imagePathOrBuffer === 'string' ? path.basename(imagePathOrBuffer) : 'buffer';

    console.log('🔍 [OCR] Processing:', fileName);

    // If it's a file path, handle it
    if (typeof imagePathOrBuffer === 'string') {
        // Handle PDF files with pdf-parse
        if (imagePathOrBuffer.toLowerCase().endsWith('.pdf')) {
            try {
                return await extractPdfText(imagePathOrBuffer);
            } catch (err) {
                console.error('❌ [OCR] PDF extraction failed:', err.message);
                return '';
            }
        }
        try {
            buffer = fs.readFileSync(imagePathOrBuffer);
            console.log('   ✓ File read successfully');
        } catch (err) {
            console.error('❌ [OCR] Cannot read file:', err.message);
            return '';
        }
    }

    try {
        console.log('   🔄 Preprocessing image...');
        const processedBuffer = await preprocessImage(buffer);

        console.log('   🔄 Running Tesseract OCR...');
        const res = await Tesseract.recognize(processedBuffer, langTag, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    process.stdout.write(`\r   📊 OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        console.log('\n   ✅ OCR Complete');
        const text = (res && res.data && res.data.text) ? res.data.text : '';
        console.log(`   📝 Extracted ${text.length} characters`);
        return text;
    } catch (err) {
        console.error('OCR failed:', err.message);
        return '';
    }
}

// ==================== EXTRACTION HELPERS ====================

function extractAadhaarNumber(text) {
    // Require spaces matches (xxxx xxxx xxxx) to avoid matching 12-digit timestamps in filenames
    const re = /\b(\d{4}\s\d{4}\s\d{4})\b/g;
    const m = re.exec(text.replace(/[Oo]/g, '0'));
    return m ? m[1].replace(/\s/g, '') : null;
}

const extractDate = (text) => {
    // DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    const m = text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
    if (m) return m[1];
    const m2 = text.match(/\b(\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/);
    return m2 ? m2[1] : null;
};

function extractPAN(text) {
    const cleanText = text.replace(/\s+/g, '');

    // PAN Regex - allow alphanumeric end char for OCR errors
    const panRegex = /([A-Z]{5}\d{4}[A-Z0-9])/i;
    const panMatch = panRegex.exec(cleanText);

    console.log(`\n🔍 PAN EXTRACTION DEBUG:`);
    console.log(`   PAN Regex Match: ${panMatch ? panMatch[0] : 'None'}`);

    // Name Extraction
    let name = null;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

    // Strategy 1: If PAN line has extra text, it might be the name
    if (panMatch) {
        const panVal = panMatch[0];
        // Find line containing the PAN (fuzzy match)
        const panLineIndex = lines.findIndex(l => l.replace(/\s+/g, '').includes(panVal));

        if (panLineIndex !== -1) {
            const panLine = lines[panLineIndex];
            console.log(`   Found PAN Line: "${panLine}"`);

            // Try to extract name from the same line
            // Escaping special regex chars
            const escPan = panVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const namePart = panLine.replace(new RegExp(escPan, 'i'), '')
                .replace(/[^a-zA-Z\s.]/g, '') // Keep dots for initials
                .trim();

            console.log(`   Potential Name from PAN Line: "${namePart}"`);

            // Prefer multi-word names; single words may be just a surname fragment
            if (namePart.length > 2 && !/income|india|govt|tax/i.test(namePart)) {
                name = namePart;
            }

            // Strategy 2: Look at lines immediately ABOVE (common in PAN cards) or BELOW
            if (!name || name.split(/\s+/).length < 2) {
                // Check previous 3 lines
                for (let i = 1; i <= 3; i++) {
                    const prevLine = lines[panLineIndex - i];
                    if (prevLine) {
                        const cleanPrev = prevLine.replace(/[^a-zA-Z\s.]/g, '').trim();
                        // Ignore common headers
                        if (cleanPrev.length > 2 &&
                            !/income|tax|department|govt|india|permanent|account|number|card/i.test(cleanPrev) &&
                            !/\d/.test(prevLine)) { // Name shouldn't have digits usually
                            console.log(`   Found Name candidate above PAN: "${cleanPrev}"`);
                            // Prefer multi-word names over single word from same line
                            if (!name || cleanPrev.split(/\s+/).length > name.split(/\s+/).length) {
                                name = cleanPrev;
                            }
                            if (name.split(/\s+/).length >= 2) break; // Stop if we got a good name
                        }
                    }
                }
            }

            // Strategy 3: Check next line if still not found or only partial
            if ((!name || name.split(/\s+/).length < 2) && lines[panLineIndex + 1]) {
                const nextLine = lines[panLineIndex + 1];
                const cleanNext = nextLine.replace(/[^a-zA-Z\s.]/g, '').trim();
                if (cleanNext.length > 2 && !/\d/.test(nextLine) &&
                    !/income|tax|department|govt|india/i.test(cleanNext)) {
                    console.log(`   Found Name candidate below PAN: "${cleanNext}"`);
                    if (!name || cleanNext.split(/\s+/).length > name.split(/\s+/).length) {
                        name = cleanNext;
                    }
                }
            }
        }
    }

    // Strategy 4: Broad scan – look for any line that looks like a proper name
    // (2+ words, all alphabetical, not a header keyword) – helps when OCR scrambles layout
    if (!name || name.split(/\s+/).length < 2) {
        const headerPattern = /income|tax|department|govt|india|permanent|account|number|card|date|birth|dob|father|signature/i;
        for (const line of lines) {
            if (/\d/.test(line)) continue; // Skip lines with digits
            const clean = line.replace(/[^a-zA-Z\s.]/g, '').trim();
            const words = clean.split(/\s+/).filter(w => w.length > 1);
            if (words.length >= 2 && !headerPattern.test(clean) && clean.length > 4) {
                console.log(`   Strategy 4 - Broad scan found name: "${clean}"`);
                name = clean;
                break;
            }
        }
    }

    // Fallback: Look for "Name" label
    if (!name) {
        name = findLabelValue(text, ['Name', 'Name of', 'Full Name']);
    }

    // Father's Name
    let fatherName = findLabelValue(text, ['Father', 'Father Name', 'Father\'s Name']);

    // Validate format strictly for the flag
    const validFormat = panMatch ? /^[A-Z]{5}\d{4}[A-Z]$/.test(panMatch[1]) : false;

    return {
        pan: panMatch ? panMatch[1].toUpperCase() : null,
        name: name,
        fatherName: fatherName,
        dateOfBirth: extractDate(text),
        isValidFormat: validFormat
    };
}

function findLabelValue(text, labelCandidates = []) {
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
        const low = lines[i].toLowerCase();
        for (const lbl of labelCandidates) {
            if (low.includes(lbl.toLowerCase())) {
                // Check current line first: "Name: John"
                const parts = lines[i].split(/[:\-]/);
                if (parts.length > 1) {
                    const val = parts.slice(1).join(' ').trim();
                    if (val.length > 2) return val;
                }
                // Check next line: "Name" \n "John"
                if (i + 1 < lines.length) return lines[i + 1].trim();
            }
        }
    }
    return null;
}

function normalizeName(name = '') {
    return (name || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function namesMatch(a = '', b = '', threshold = 0.75) {
    const n1 = normalizeName(a);
    const n2 = normalizeName(b);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    const score = stringSimilarity.compareTwoStrings(n1, n2);
    return score >= threshold;
}

// ==================== DOCUMENT PARSERS ====================

async function parseAadhaar(imagePath, opts = {}) {
    const text = await performOCR(imagePath);

    // Aadhaar Number
    // Use the strict regex helper
    const aadhaar = extractAadhaarNumber(text);

    // Name Extraction
    // Strategy: Look for "To" line (address style)
    let name = findLabelValue(text, ['Name', 'Name :', 'नाम']);

    if (!name) {
        const lines = text.split('\n').map(l => l.trim());
        const toIndex = lines.findIndex(l => l.toLowerCase() === 'to' || l.toLowerCase() === 'to,');

        if (toIndex !== -1) {
            // Check next few lines for a valid name
            // Skip lines that contain address keywords or are too short
            for (let i = 1; i <= 3; i++) {
                if (toIndex + i >= lines.length) break;

                const candidate = lines[toIndex + i];
                const lowerK = candidate.toLowerCase();

                // Skip markers
                if (candidate.startsWith('[')) continue;

                // Skip common junk or address start
                if (extractAadhaarNumber(candidate)) continue; // Skip if it's the number
                if (lowerK.includes('s/o') || lowerK.includes('d/o') || lowerK.includes('w/o') || lowerK.includes('address')) continue;
                if (candidate.length < 3) continue;
                if (/\d/.test(candidate)) continue; // Name usually doesn't have digits
                if (/[!@#$%^&*()_+={}\[\]|\\:;"'<>,?\/]/.test(candidate)) continue; // No special chars allowed in simple names

                name = candidate;
                break;
            }
        }
    }

    // Fallback: Scan lines for typical name pattern (2+ words, capital letters, no digits)
    // If we have no name yet, and we have lines
    if (!name) {
        // This is a bit risky but better than nothing for some cards
        // Look for line with "DOB" or "Year of Birth" and check the line BEFORE it
        const dobLineIndex = text.split('\n').findIndex(l => /dob|date of birth|year of birth/i.test(l));
        if (dobLineIndex > 0) {
            const lines = text.split('\n').map(l => l.trim());
            const prevLine = lines[dobLineIndex - 1];
            if (prevLine && prevLine.length > 3 && !/\d/.test(prevLine) && !/[!@#$%^&*()_+={}\[\]|\\:;"'<>,?\/]/.test(prevLine)) {
                name = prevLine;
            }
        }
    }

    const address = findLabelValue(text, ['address', 'addr', 'पता', 'S/O', 'W/O', 'D/O']);
    const dob = extractDate(text);
    const gender = /Male|Female/i.exec(text)?.[0] || null;

    return {
        rawText: text,
        aadhaar,
        name,
        address,
        dateOfBirth: dob,
        gender,
        aadhaarLast4: aadhaar ? aadhaar.slice(-4) : null,
        confidence: aadhaar ? 0.8 : 0.3

    };
}

async function parsePAN(imagePath, opts = {}) {
    // Use performOCR to support scanned PDFs
    const mime = imagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
    const text = await performOCR(imagePath, mime);

    // Use the enhanced extractPAN helper
    const panData = extractPAN(text);

    return {
        rawText: text,
        pan: panData.pan,
        name: panData.name || findLabelValue(text, ['name', "holder's name", 'नाम']),
        fatherName: panData.fatherName || findLabelValue(text, ['father', "father's name", 'पिता']),
        dateOfBirth: panData.dateOfBirth || findLabelValue(text, ['dob', 'date of birth']),
        isValidFormat: panData.isValidFormat,
        confidence: panData.pan ? 0.9 : 0.4
    };
}

async function parseBankStatement(imagePath, opts = {}) {
    const rawOcrText = await performOCR(imagePath);

    // Strip the [SCANNED_PDF:filename] prefix injected by extractPdfText() so it
    // does not pollute the name / bank-name regexes below.
    // The actual OCR content follows after "--- Page ... ---" markers.
    let text = rawOcrText;
    const scannedPageIdx = text.indexOf('--- Page ');
    if (scannedPageIdx !== -1) {
        text = text.slice(scannedPageIdx);
    }

    // Account Number
    // Pattern: "Account No: 9988221100" or "A/c No."
    let accountNo = null;
    // First try strict digits-only match
    const accMatchStrict = text.match(/(?:Account\s*No|A\/c\s*No|AC\s*No)[\s:.]*([\d]+)/i);
    if (accMatchStrict) {
        accountNo = accMatchStrict[1];
    } else {
        // Fallback: accept alphanumeric (OCR sometimes reads letters in account numbers)
        const accMatchFuzzy = text.match(/(?:Account\s*No|A\/c\s*No|AC\s*No)[\s:.]*("?[A-Z0-9]{6,20}"?)/i);
        if (accMatchFuzzy) accountNo = accMatchFuzzy[1].replace(/["]/g, '');
    }

    // Account Holder
    // Pattern: "Customer: Hemanth CS |" — stop before | OR before "Account No" section
    let holderName = null;
    const nameMatch = text.match(/(?:Customer|Account Holder)\s*[:\-]\s*([^|\n]+?)(?:\s*(?:Account\s*No|A\/c)|$)/i);
    if (nameMatch) {
        // Clean up OCR noise: strip leading dots, quotes, special chars
        holderName = nameMatch[1].replace(/^[^a-zA-Z]+/, '').trim();
        if (holderName.length < 2) holderName = null; // Reject garbage
    }
    // Fallback to simple Name: label
    if (!holderName) {
        const simpleMatch = text.match(/(?:Name)\s*[:\-]\s*([A-Za-z][A-Za-z\s.]{2,40})/i);
        if (simpleMatch) holderName = simpleMatch[1].trim();
    }

    // Bank Name & IFSC — avoid matching the filename as bank name
    let bankName = findLabelValue(text, ['Bank', 'Bank Name']);
    if (!bankName) {
        const bankMatch = text.match(/([A-Z][A-Za-z\s]{2,}BANK)/i);
        if (bankMatch) {
            const candidate = bankMatch[1].trim();
            // Reject if it looks like a filename (contains dots or underscores)
            if (!candidate.includes('.') && !candidate.includes('_')) {
                bankName = candidate;
            }
        }
    }
    const ifsc = text.match(/[A-Z]{4}0[A-Z0-9]{6}/)?.[0] || null;

    // Estimated Salary
    // Look for "SALARY" or "SKLARY", "NEFT", "CREDIT"
    let estimatedSalary = 0;
    const lines = text.split('\n');
    const salaryKeywords = ['SALARY', 'SKLARY', 'SALRY', 'REMUNERATION', 'WAGES', 'NEFT', 'CREDIT'];

    for (const line of lines) {
        const upper = line.toUpperCase();
        if (salaryKeywords.some(k => upper.includes(k))) {
            const numbers = line.match(/[\d,]+\.\d{2}/g);
            if (numbers && numbers.length > 0) {
                const amounts = numbers.map(n => parseFloat(n.replace(/,/g, '')));
                const maxAmt = Math.max(...amounts);
                if (maxAmt > estimatedSalary && maxAmt > 5000) { // Threshold to avoid small credits
                    estimatedSalary = maxAmt;
                }
            }
        }
    }

    return {
        rawText: rawOcrText,
        accountNumber: accountNo,
        accountHolderName: holderName,
        bankName: bankName || null,
        ifscCode: ifsc,
        estimatedMonthlySalary: estimatedSalary || null,
        confidence: (accountNo && holderName) ? 0.8 : 0.4
    };
}



async function parseSalarySlip(imagePath, opts = {}) {
    const langs = opts.langs || ['eng'];
    // Use performOCR to support scanned PDFs
    const mime = imagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
    const text = await performOCR(imagePath, mime);

    // Employee name - more flexible patterns
    const nameMatch = text.match(/(?:Employee Name|Name|Employee)\s*[:\-]?\s*([A-Za-z\s]+?)(?:\s+Employee ID|\s+ID|\s+Designation|$)/i);
    const employeeName = nameMatch ? nameMatch[1].trim() : null;

    // Parse amount helper - handle ₹, Rs., ¥, commas, and various formats
    const parseAmount = (pattern) => {
        const match = text.match(pattern);
        if (match) {
            // Extract numeric part, remove commas and currency symbols
            const numStr = match[1].replace(/[,₹¥]/g, '').replace(/Rs\.?/gi, '').trim();
            const parsed = parseFloat(numStr);
            console.log(`   Pattern: ${pattern}, Match: ${match[0]}, Extracted: ${numStr}, Parsed: ${parsed}`);
            return isNaN(parsed) ? null : parsed;
        }
        return null;
    };

    // Try multiple patterns for each field
    const basicSalary = parseAmount(/(?:Basic|Basic Salary)\s*[:\-]?\s*(?:Rs\.?|₹|¥)?\s*([0-9,]+)/i);

    // Gross Salary - try both "Gross Salary" and "Gross Earnings"
    let grossSalary = parseAmount(/(?:Gross Salary)\s*[:\-]?\s*(?:Rs\.?|₹|¥)?\s*([0-9,]+)/i);
    if (!grossSalary) {
        grossSalary = parseAmount(/(?:Gross Earnings|Gross)\s+([0-9,]+)/i);
    }

    // Net Salary - try multiple patterns
    let netSalary = parseAmount(/(?:Net Salary|Net Pay|Take Home)\s*[:\-]?\s*(?:Rs\.?|₹|¥)?\s*([0-9,]+)/i);
    if (!netSalary) {
        // Try pattern with colon and symbol: "Net Salary: ¥51,666"
        netSalary = parseAmount(/Net Salary\s*:\s*[₹¥]\s*([0-9,]+)/i);
    }

    console.log(`\n🔍 SALARY SLIP PARSING DEBUG:`);
    console.log(`   Employee Name Match: ${nameMatch ? nameMatch[0] : 'Not found'}`);
    console.log(`   Basic Salary: ₹${basicSalary || 'N/A'}`);
    console.log(`   Gross Salary: ₹${grossSalary || 'N/A'}`);
    console.log(`   Net Salary: ₹${netSalary || 'N/A'}`);

    return {
        rawText: text,
        employeeName,
        basicSalary,
        grossSalary,
        netSalary,
        confidence: netSalary ? 0.8 : 0.4
    };
}

// ==================== FRAUD DETECTION ====================

function performFraudCheck(documents, customerData = null) {
    const issues = [];
    let riskScore = 0;

    const { aadhaar, pan, bankStatement, salarySlip } = documents || {};

    // Check 1: Name consistency
    // Only include names from documents where OCR confidence is sufficient.
    // PAN name is excluded when isValidFormat=false (OCR likely garbled the PAN/name).
    const names = [];
    if (aadhaar?.name) names.push({ source: 'Aadhaar', name: aadhaar.name });
    if (pan?.name && pan.isValidFormat) names.push({ source: 'PAN', name: pan.name });
    if (bankStatement?.accountHolderName && bankStatement.confidence >= 0.6)
        names.push({ source: 'Bank', name: bankStatement.accountHolderName });
    if (salarySlip?.employeeName) names.push({ source: 'Salary', name: salarySlip.employeeName });

    if (names.length > 1) {
        for (let i = 0; i < names.length - 1; i++) {
            for (let j = i + 1; j < names.length; j++) {
                if (!namesMatch(names[i].name, names[j].name, 0.7)) {
                    issues.push({
                        type: 'NAME_MISMATCH',
                        severity: 'high',
                        message: `Name mismatch: ${names[i].source} vs ${names[j].source}`
                    });
                    riskScore += 25;
                }
            }
        }
    }

    // Check 1.5: User-entered Name vs Documents
    if (customerData?.name) {
        const userName = customerData.name;
        for (const doc of names) {
            if (!namesMatch(userName, doc.name, 0.7)) {
                issues.push({
                    type: 'USER_NAME_MISMATCH',
                    severity: 'high',
                    message: `User name (${userName}) does not match ${doc.source} name (${doc.name})`
                });
                riskScore += 25;
            }
        }
    }

    // Check 2: Aadhaar format
    if (aadhaar?.aadhaar && !/^\d{12}$/.test(aadhaar.aadhaar.replace(/\s/g, ''))) {
        issues.push({ type: 'INVALID_AADHAAR', severity: 'high', message: 'Invalid Aadhaar format' });
        riskScore += 30;
    }

    // Check 3: PAN format
    if (pan?.pan && !pan.isValidFormat) {
        issues.push({ type: 'INVALID_PAN', severity: 'medium', message: 'PAN format could not be verified (OCR quality issue — please upload a clearer image)' });
        riskScore += 10; // Low penalty: likely OCR noise, not fraud
    }

    // Check 4: Salary consistency between documents
    if (salarySlip?.netSalary && bankStatement?.estimatedMonthlySalary) {
        const diff = Math.abs(salarySlip.netSalary - bankStatement.estimatedMonthlySalary);
        if (diff / salarySlip.netSalary > 0.3) {
            issues.push({ type: 'SALARY_MISMATCH', severity: 'medium', message: 'Salary mismatch between documents' });
            riskScore += 15;
        }
    }

    // Check 5: User-entered salary vs Salary Slip verification
    if (customerData?.monthlySalary && salarySlip?.netSalary) {
        const enteredSalary = parseInt(customerData.monthlySalary);
        const extractedSalary = salarySlip.netSalary;
        const diff = Math.abs(enteredSalary - extractedSalary);
        const percentDiff = (diff / extractedSalary) * 100;

        if (percentDiff >= 20) { // 20% or more difference → REJECTED
            issues.push({
                type: 'USER_SALARY_MISMATCH',
                severity: 'high',
                message: `User entered salary (₹${enteredSalary}) differs from salary slip (₹${extractedSalary}) by ${percentDiff.toFixed(0)}%`,
                details: {
                    enteredSalary,
                    extractedSalary,
                    difference: diff,
                    percentDifference: percentDiff
                }
            });
            riskScore += 30;
            console.log(`\n⚠️  SALARY VERIFICATION FAILED:`);
            console.log(`   User Entered: ₹${enteredSalary}`);
            console.log(`   Salary Slip: ₹${extractedSalary}`);
            console.log(`   Difference: ${percentDiff.toFixed(1)}% (threshold: 20%)`);
        } else {
            console.log(`\n✅ SALARY VERIFICATION PASSED:`);
            console.log(`   User Entered: ₹${enteredSalary}`);
            console.log(`   Salary Slip: ₹${extractedSalary}`);
            console.log(`   Difference: ${percentDiff.toFixed(1)}% (within 20% threshold)`);
        }
    }

    // Check 6: Salary slip MUST be present (mandatory document)
    // If salary slip was not uploaded / could not be parsed, reject immediately
    if (customerData?.monthlySalary && !salarySlip?.netSalary) {
        issues.push({
            type: 'SALARY_SLIP_MISSING',
            severity: 'high',
            message: 'Salary slip could not be parsed or was not uploaded. Income verification failed — application rejected.'
        });
        riskScore += 40;
        console.log('\n❌ SALARY SLIP MISSING/UNREADABLE — application will be rejected');
    }

    return {
        passed: riskScore < 30,
        riskScore: Math.min(100, riskScore),
        riskLevel: riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low',
        flagged: riskScore >= 30,
        issues
    };
}

// ==================== EXPORTS ====================

module.exports = {
    ocrImage,
    performOCR,
    parseAadhaar,
    parsePAN,
    parseBankStatement,
    parseSalarySlip,
    performFraudCheck,
    namesMatch,
    extractAadhaarNumber,
    extractPAN,
    normalizeName
};

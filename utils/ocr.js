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
        console.log('   🔄 Running Tesseract OCR...');
        const res = await Tesseract.recognize(buffer, langTag, {
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
    const re = /\b(\d{4}\s?\d{4}\s?\d{4})\b/g;
    const m = re.exec(text.replace(/[Oo]/g, '0'));
    return m ? m[1].replace(/\s/g, '') : null;
}

function extractPAN(text) {
    const re = /\b([A-Z]{5}\d{4}[A-Z])\b/i;
    const m = re.exec(text.replace(/\s+/g, ''));
    return m ? m[1].toUpperCase() : null;
}

function findLabelValue(text, labelCandidates = []) {
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
        const low = lines[i].toLowerCase();
        for (const lbl of labelCandidates) {
            if (low.includes(lbl.toLowerCase())) {
                const parts = lines[i].split(':');
                if (parts.length > 1) return parts.slice(1).join(':').trim();
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
    const langs = opts.langs || ['eng'];
    // Use performOCR to support scanned PDFs
    const mime = imagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
    const text = await performOCR(imagePath, mime);

    const aadhaar = extractAadhaarNumber(text);
    const name = findLabelValue(text, ['name', 'name :', 'नाम']);
    const address = findLabelValue(text, ['address', 'addr', 'पता']);
    const dob = findLabelValue(text, ['dob', 'date of birth', 'जन्म']);
    const gender = findLabelValue(text, ['male', 'female', 'पुरुष', 'महिला']);
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
    const langs = opts.langs || ['eng'];
    // Use performOCR to support scanned PDFs
    const mime = imagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
    const text = await performOCR(imagePath, mime);

    const pan = extractPAN(text);
    const name = findLabelValue(text, ['name', "holder's name", 'नाम']);
    const fatherName = findLabelValue(text, ['father', "father's name", 'पिता']);
    const dob = findLabelValue(text, ['dob', 'date of birth']);

    // Validate PAN format
    const isValidFormat = pan && /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/.test(pan);

    return {
        rawText: text,
        pan,
        name,
        fatherName,
        dateOfBirth: dob,
        isValidFormat,
        confidence: isValidFormat ? 0.9 : 0.4
    };
}

async function parseBankStatement(imagePath, opts = {}) {
    const langs = opts.langs || ['eng'];
    // Use performOCR to support scanned PDFs
    const mime = imagePath.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png';
    const text = await performOCR(imagePath, mime);

    // Account number
    const accMatch = text.match(/(?:A\/C|Account|Acc\.?\s*No\.?)\s*[:\-]?\s*(\d{9,18})/i);
    const accountNumber = accMatch ? accMatch[1] : null;

    // Account holder
    const holderMatch = text.match(/(?:Account Holder|Customer Name|Name)\s*[:\-]?\s*([A-Za-z\s]+)/i);
    const accountHolderName = holderMatch ? holderMatch[1].trim() : null;

    // Bank name
    const bankMatch = text.match(/(HDFC|ICICI|SBI|AXIS|KOTAK|YES|IDFC|IndusInd|PNB|BOB)/i);
    const bankName = bankMatch ? bankMatch[1].toUpperCase() : null;

    // IFSC
    const ifscMatch = text.match(/([A-Z]{4}0[A-Z0-9]{6})/);
    const ifscCode = ifscMatch ? ifscMatch[1] : null;

    // Estimate salary from credits
    const creditPattern = /(?:CR|Credit)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+)/gi;
    const credits = [];
    let match;
    while ((match = creditPattern.exec(text)) !== null) {
        const amt = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amt) && amt > 10000) credits.push(amt);
    }

    const estimatedSalary = credits.length > 0
        ? Math.round(credits.reduce((a, b) => a + b, 0) / credits.length)
        : null;

    return {
        rawText: text,
        accountNumber,
        accountHolderName,
        bankName,
        ifscCode,
        estimatedMonthlySalary: estimatedSalary,
        confidence: accountNumber ? 0.7 : 0.3
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
    const names = [];
    if (aadhaar?.name) names.push({ source: 'Aadhaar', name: aadhaar.name });
    if (pan?.name) names.push({ source: 'PAN', name: pan.name });
    if (bankStatement?.accountHolderName) names.push({ source: 'Bank', name: bankStatement.accountHolderName });
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

    // Check 2: Aadhaar format
    if (aadhaar?.aadhaar && !/^\d{12}$/.test(aadhaar.aadhaar.replace(/\s/g, ''))) {
        issues.push({ type: 'INVALID_AADHAAR', severity: 'high', message: 'Invalid Aadhaar format' });
        riskScore += 30;
    }

    // Check 3: PAN format
    if (pan?.pan && !pan.isValidFormat) {
        issues.push({ type: 'INVALID_PAN', severity: 'high', message: 'Invalid PAN format' });
        riskScore += 30;
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

        if (percentDiff > 20) { // More than 20% difference
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

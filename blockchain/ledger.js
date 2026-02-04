
const fs = require('fs');
const path = require('path');
const { sha256 } = require('../utils/hash');

const ledgerDir = __dirname;

function getLedger(ledgerName) {
  const ledgerPath = path.join(ledgerDir, `${ledgerName}.json`);
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }
  const data = fs.readFileSync(ledgerPath);
  return JSON.parse(data);
}

function appendToLedger(ledgerName, data) {
  const ledger = getLedger(ledgerName);
  const previousHash = ledger.length > 0 ? ledger[ledger.length - 1].hash : '0';
  
  const blockData = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  const newBlock = {
    data: blockData,
    previousHash,
    hash: sha256(JSON.stringify(blockData) + previousHash)
  };

  ledger.push(newBlock);
  const ledgerPath = path.join(ledgerDir, `${ledgerName}.json`);
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return newBlock;
}

module.exports = {
  getLedger,
  appendToLedger
};

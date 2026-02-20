const { performFraudCheck } = require('./utils/ocr');

const customerData = {
    name: "Aashish amount",
    monthlySalary: "600000"
};

const documents = {
    aadhaar: { name: "Hemanth C S", aadhaar: "123412341234" },
    pan: { name: "Lopes", pan: "BOUPH03668", isValidFormat: false },
    salarySlip: { employeeName: "Hemanth CS", netSalary: 51666 }
};

console.log("--- Testing Fraud Check ---");
const result = performFraudCheck(documents, customerData);
console.log("Result Passed:", result.passed);
console.log("Issues:", JSON.stringify(result.issues, null, 2));

if (result.issues.some(i => i.type === 'USER_NAME_MISMATCH')) {
    console.log("✅ SUCCESS: Name mismatch detected.");
} else {
    console.log("❌ FAILURE: Name mismatch NOT detected.");
}

if (result.issues.some(i => i.type === 'USER_SALARY_MISMATCH')) {
    console.log("✅ SUCCESS: Salary mismatch detected.");
} else {
    console.log("❌ FAILURE: Salary mismatch NOT detected.");
}

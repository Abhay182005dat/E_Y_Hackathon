# 🏦 BFSI Loan Platform

An AI-powered loan origination system with intelligent approval scoring, document verification via OCR, and real-time EMI management.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)


---

## ✨ Features

### 🤖 AI-Powered Approval Score
- **5-Factor Algorithm** calculating 300-900 score based on:
  - Income Stability (25%)
  - Debt-to-Income Ratio (25%)
  - Loan Amount Feasibility (20%)
  - Banking Behavior (15%)
  - Employment Type (15%)

### 📄 Document Verification (OCR)
- Aadhaar Card parsing
- PAN Card verification
- Bank Statement analysis
- Salary Slip extraction
- Fraud detection

### 💬 Loan Negotiation Chat
- Interactive AI chatbot
- Real-time offer negotiation
- Automatic rate adjustments

### 📊 EMI Management
- Auto-generated payment schedules
- Next payment reminders with countdown
- Color-coded due date alerts

### 🔐 Secure Authentication
- OTP-based user login (Twilio SMS)
- JWT token authentication
- Admin portal with role-based access

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Environment Setup

Create a `.env` file in the root directory:

```env
PORT=3001
JWT_SECRET=your_secure_jwt_secret

# Optional: Twilio for real SMS OTP
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Run the Application

```bash
# Terminal 1: Start backend server
npm start

# Terminal 2: Start frontend
cd frontend
npm run dev
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

---

## 🔑 Default Credentials

| Role | Login | Password/OTP |
|------|-------|--------------|
| User | Any phone number | OTP shown in console |

---

## 📁 Project Structure

```
ey-techathon/
├── server.js              # Express backend
├── agents/                # Loan processing agents
├── utils/
│   ├── auth.js            # Authentication & JWT
│   ├── creditScore.js     # Approval Score algorithm
│   ├── ocr.js             # Document parsing
│   └── geminiClient.js    # AI integration
├── frontend/
│   ├── app/
│   │   ├── page.jsx       # Landing page
│   │   ├── login/         # Authentication
│   │   ├── apply/         # Loan application flow
│   │   ├── dashboard/     # User dashboard
│   │   ├── admin/         # Admin portal
│   │   └── context/       # Auth context
│   └── public/
└── uploads/               # Document storage
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP for login |
| POST | `/api/auth/login` | Verify OTP & login |
| POST | `/api/auth/admin-login` | Admin login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/verify-docs` | OCR document verification |
| POST | `/api/calculate-score` | Calculate approval score |
| POST | `/api/chat` | Loan negotiation chat |
| GET | `/api/applications` | Get all applications (admin) |
| PUT | `/api/applications/:id` | Update application status |

---

## 📈 Approval Score Formula

```
ApprovalScore = 300 + (WeightedAverage × 600)

Where:
  WeightedAverage = 
    (IncomeScore × 0.25) +
    (DTIScore × 0.25) +
    (FeasibilityScore × 0.20) +
    (BankingScore × 0.15) +
    (EmploymentScore × 0.15)
```

| Score Range | Grade | Risk Level |
|-------------|-------|------------|
| 800+ | A+ | Low |
| 750-799 | A | Low |
| 700-749 | B+ | Medium |
| 650-699 | B | Medium |
| 550-649 | C | High |
| <550 | D | High |

---

## 🛡️ Security Features

- Helmet.js for HTTP headers
- Rate limiting (100 req/15min)
- bcrypt password hashing (12 rounds)
- JWT with 7-day expiry
- Aadhaar/PAN masking

---


---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

**Built with ❤️ for EY Techathon 2026**

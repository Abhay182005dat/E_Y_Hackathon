import './globals.css';
import { AuthProvider } from './context/AuthContext';

export const metadata = {
    title: 'BFSI Loan Platform',
    description: 'AI-Powered Loan Processing System with Blockchain Verification',
}

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <script src="https://cdn.tailwindcss.com"></script>
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    )
}

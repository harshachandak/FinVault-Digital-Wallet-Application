const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;
const DB_FILE = path.join(__dirname, 'database.json');
const DAILY_LIMIT = 10000;

// Utility: Read JSON file safely
async function readDatabase() {
    try {
        if (!await fs.pathExists(DB_FILE)) {
            await fs.writeJson(DB_FILE, {});
        }
        return await fs.readJson(DB_FILE);
    } catch (err) {
        console.error("Database reading error:", err);
        return {};
    }
}

// Utility: Write JSON file safely
async function writeDatabase(data) {
    try {
        await fs.writeJson(DB_FILE, data, { spaces: 4 });
    } catch (err) {
        console.error("Database saving error:", err);
    }
}

// 1. REGISTRATION ENDPOINT
app.post('/api/register', async (req, res) => {
    try {
        const { userId, displayName, email, phone, balance, pin } = req.body;
        const upiId = `${userId.toLowerCase().trim()}@upi`;
        const dbData = await readDatabase();

        if (dbData[upiId]) {
            return res.status(400).json({ message: 'This UPI ID tag is already claimed!' });
        }

        dbData[upiId] = {
            userId, upiId, displayName, email, phone,
            balance: parseFloat(balance) || 0,
            pin: pin.trim(),
            transactions: []
        };

        await writeDatabase(dbData);
        res.status(201).json({ message: 'User registered successfully', upiId });
    } catch (err) {
        res.status(500).json({ message: 'Internal server registration error' });
    }
});

// 2. LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
    try {
        const { upiId, pin } = req.body;
        const dbData = await readDatabase();
        const targetUser = dbData[upiId.toLowerCase().trim()];

        if (targetUser && targetUser.pin === pin.trim()) {
            const profileResponse = { ...targetUser };
            delete profileResponse.pin;
            return res.json(profileResponse);
        }
        res.status(401).json({ message: 'Invalid credentials or incorrect security PIN.' });
    } catch (err) {
        res.status(500).json({ message: 'Internal login processing error' });
    }
});

// 3. FUNDS TRANSFER ENDPOINT (Enforcing Daily ₹10,000 Cap)
app.post('/api/transfer', async (req, res) => {
    try {
        const { senderUpi, targetUpi, amount, remark, pin } = req.body;
        const transferAmount = parseFloat(amount);
        const dbData = await readDatabase();

        const sender = dbData[senderUpi];
        const receiver = dbData[targetUpi];

        if (!sender || !receiver) {
            return res.status(444).json({ message: 'Target profile or sender profile not found.' });
        }
        if (sender.pin !== pin.trim()) {
            return res.status(401).json({ message: 'Transaction Declined: Incorrect UPI PIN!' });
        }
        if (sender.balance < transferAmount) {
            return res.status(400).json({ message: 'Transaction Blocked: Insufficient funds.' });
        }

        // Check daily limit rule
        const todayStr = new Date().toDateString();
        const todaySpent = sender.transactions
            .filter(tx => tx.type === 'out' && new Date(tx.date).toDateString() === todayStr)
            .reduce((sum, tx) => sum + tx.amount, 0);

        if (todaySpent + transferAmount > DAILY_LIMIT) {
            return res.status(403).json({ 
                message: `Limit Exceeded! Remaining daily limit is ₹${DAILY_LIMIT - todaySpent}.` 
            });
        }

        // Execute transactions
        const timestamp = new Date().toISOString();
        sender.balance -= transferAmount;
        sender.transactions.unshift({
            type: 'out', amount: transferAmount, target: targetUpi, remark: remark || 'Wallet Transfer', date: timestamp
        });

        receiver.balance += transferAmount;
        receiver.transactions.unshift({
            type: 'in', amount: transferAmount, target: senderUpi, remark: remark || 'Funds Received', date: timestamp
        });

        await writeDatabase(dbData);

        const senderResponse = { ...sender };
        delete senderResponse.pin;
        res.json({ message: 'Transfer successful', user: senderResponse });
    } catch (err) {
        res.status(500).json({ message: 'Fatal server operation error' });
    }
});

// 4. SYNC ENDPOINT
app.get('/api/user/:upiId', async (req, res) => {
    try {
        const dbData = await readDatabase();
        const user = dbData[req.params.upiId.toLowerCase().trim()];
        if (!user) return res.status(404).json({ message: 'Profile not found.' });

        const userResponse = { ...user };
        delete userResponse.pin;
        res.json(userResponse);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Find this at the bottom of your server.js:
app.listen(PORT, async () => {
    console.log(`Backend live on http://localhost:${PORT}`);
    
    // FORCED CREATION: This forces the file to build immediately on startup
    try {
        if (!await fs.pathExists(DB_FILE)) {
            await fs.writeJson(DB_FILE, {});
            console.log("Database file successfully created at:", DB_FILE);
        }
    } catch (err) {
        console.error("Forced database creation failed:", err);
    }
});
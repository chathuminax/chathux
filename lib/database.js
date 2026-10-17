
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'local-db.json');

const DEFAULT_CONFIG = {
    AUTO_RECORDING: 'false',
    AUTO_TYPING: 'false',
    ANTI_CALL: 'false',
    REJECT_MSG: '*Your call was automatically rejected!*',
    READ_MESSAGE: 'false',
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_STATUS_REPLY: 'false',
    AUTO_STATUS_MSG: 'Hello from Chathuwa',
    AUTO_LIKE_EMOJI: ['❤️', '👍', '😮', '😎']
};

function cleanNumber(number) {
    return String(number || '').replace(/\D/g, '');
}

function ensureDatabase() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({
            sessions: [],
            userConfigs: [],
            otps: [],
            activeNumbers: [],
            stats: []
        }, null, 2));
    }
}

function readDatabase() {
    ensureDatabase();

    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (error) {
        throw new Error('Cannot read local database: ' + error.message);
    }
}

function writeDatabase(data) {
    ensureDatabase();

    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DB_FILE);
}

async function connectdb() {
    ensureDatabase();
    console.log('✅ Local database connected. MongoDB is not required.');
    return true;
}

async function saveSessionToMongoDB(number, credentials) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);
        const now = new Date().toISOString();

        let item = db.sessions.find(x => x.number === n);

        if (item) {
            item.credentials = credentials;
            item.updatedAt = now;
        } else {
            db.sessions.push({
                number: n,
                credentials,
                createdAt: now,
                updatedAt: now
            });
        }

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('Session save error:', error.message);
        return false;
    }
}

async function getSessionFromMongoDB(number) {
    try {
        const db = readDatabase();
        const item = db.sessions.find(
            x => x.number === cleanNumber(number)
        );

        return item ? item.credentials : null;
    } catch (error) {
        console.error('Session read error:', error.message);
        return null;
    }
}

async function deleteSessionFromMongoDB(number) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        db.sessions = db.sessions.filter(x => x.number !== n);
        db.activeNumbers = db.activeNumbers.filter(x => x.number !== n);

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('Session delete error:', error.message);
        return false;
    }
}

async function getUserConfigFromMongoDB(number) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        let item = db.userConfigs.find(x => x.number === n);

        if (!item) {
            item = {
                number: n,
                config: { ...DEFAULT_CONFIG },
                createdAt: new Date().toISOString()
            };

            db.userConfigs.push(item);
            writeDatabase(db);
        }

        return JSON.parse(JSON.stringify(item.config));
    } catch (error) {
        console.error('Config read error:', error.message);
        return { ...DEFAULT_CONFIG };
    }
}

async function updateUserConfigInMongoDB(number, newConfig) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        let item = db.userConfigs.find(x => x.number === n);

        if (item) {
            item.config = newConfig;
            item.updatedAt = new Date().toISOString();
        } else {
            db.userConfigs.push({
                number: n,
                config: newConfig,
                createdAt: new Date().toISOString()
            });
        }

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('Config update error:', error.message);
        return false;
    }
}

async function saveOTPToMongoDB(number, otp, config) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        db.otps = db.otps.filter(x => x.number !== n);

        db.otps.push({
            number: n,
            otp: String(otp),
            config,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('OTP save error:', error.message);
        return false;
    }
}

async function verifyOTPFromMongoDB(number, otp) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        const index = db.otps.findIndex(x =>
            x.number === n &&
            x.otp === String(otp) &&
            x.expiresAt > Date.now()
        );

        if (index === -1) {
            return {
                valid: false,
                error: 'Invalid or expired OTP'
            };
        }

        const record = db.otps.splice(index, 1)[0];
        writeDatabase(db);

        return {
            valid: true,
            config: record.config
        };
    } catch (error) {
        console.error('OTP verification error:', error.message);
        return {
            valid: false,
            error: 'Verification error'
        };
    }
}

async function addNumberToMongoDB(number) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        let item = db.activeNumbers.find(x => x.number === n);

        if (item) {
            item.isActive = true;
            item.lastConnected = new Date().toISOString();
        } else {
            db.activeNumbers.push({
                number: n,
                isActive: true,
                lastConnected: new Date().toISOString()
            });
        }

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('Add number error:', error.message);
        return false;
    }
}

async function removeNumberFromMongoDB(number) {
    try {
        const db = readDatabase();
        const n = cleanNumber(number);

        db.activeNumbers = db.activeNumbers.filter(
            x => x.number !== n
        );

        writeDatabase(db);
        return true;
    } catch (error) {
        console.error('Remove number error:', error.message);
        return false;
    }
}

async function getAllNumbersFromMongoDB() {
    try {
        const db = readDatabase();

        return db.activeNumbers
            .filter(x => x.isActive)
            .map(x => x.number);
    } catch (error) {
        console.error('Get numbers error:', error.message);
        return [];
    }
}

async function incrementStats(number, field) {
    const allowedFields = [
        'commandsUsed',
        'messagesReceived',
        'messagesSent',
        'groupsInteracted'
    ];

    if (!allowedFields.includes(field)) return;

    try {
        const db = readDatabase();
        const n = cleanNumber(number);
        const today = new Date().toISOString().slice(0, 10);

        let item = db.stats.find(
            x => x.number === n && x.date === today
        );

        if (!item) {
            item = {
                number: n,
                date: today,
                commandsUsed: 0,
                messagesReceived: 0,
                messagesSent: 0,
                groupsInteracted: 0
            };

            db.stats.push(item);
        }

        item[field] = (item[field] || 0) + 1;
        writeDatabase(db);
    } catch (error) {
        console.error('Stats update error:', error.message);
    }
}

async function getStatsForNumber(number) {
    try {
        const db = readDatabase();

        return db.stats
            .filter(x => x.number === cleanNumber(number))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 30);
    } catch (error) {
        console.error('Stats read error:', error.message);
        return [];
    }
}

module.exports = {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    incrementStats,
    getStatsForNumber,
    getUserConfig: getUserConfigFromMongoDB,
    updateUserConfig: updateUserConfigInMongoDB
};

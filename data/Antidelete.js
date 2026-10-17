
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'antidelete.json');

function readData() {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        if (!fs.existsSync(dbFile)) {
            fs.writeFileSync(dbFile, '{}');
        }

        return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (error) {
        console.error('Antidelete database error:', error.message);
        return {};
    }
}

function writeData(data) {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

const getAntideleteStatus = async (chatId) => {
    const data = readData();
    return data[chatId] === true;
};

const setAntideleteStatus = async (chatId, status) => {
    try {
        const data = readData();
        data[chatId] = Boolean(status);
        writeData(data);
        return true;
    } catch (error) {
        console.error('Failed to save antidelete status:', error.message);
        return false;
    }
};

module.exports = {
    getAntideleteStatus,
    setAntideleteStatus
};

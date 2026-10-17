
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'antidelete.json');

function readData() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, '{}');
    }

    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (error) {
        console.error('Antidelete read error:', error.message);
        return {};
    }
}

function writeData(data) {
    const tempFile = DB_FILE + '.tmp';

    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DB_FILE);
}

const getAntideleteStatus = async (chatId) => {
    try {
        const data = readData();
        return data[chatId] === true;
    } catch (error) {
        console.error('Antidelete status error:', error.message);
        return false;
    }
};

const setAntideleteStatus = async (chatId, status) => {
    try {
        const data = readData();
        data[chatId] = Boolean(status);
        writeData(data);
        return true;
    } catch (error) {
        console.error('Antidelete update error:', error.message);
        return false;
    }
};

module.exports = {
    getAntideleteStatus,
    setAntideleteStatus
};

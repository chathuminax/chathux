// Local JSON database adapter: no MongoDB/MONGODB_URI required.
// Data is stored in ./data/local-db.json. Use persistent disk on your host.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dataDir, 'local-db.json');
const defaults = {
  sessions: [], userConfigs: [], otps: [], activeNumbers: [], stats: []
};

function ensureDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify(defaults, null, 2));
}
function readDb() {
  ensureDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    return { ...defaults, ...parsed };
  } catch (e) {
    console.error('Local database file is invalid; using empty database:', e.message);
    return { ...defaults };
  }
}
function writeDb(db) {
  ensureDb();
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}
function clean(number) { return String(number || '').replace(/[^0-9]/g, ''); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

async function connectdb() {
  ensureDb();
  console.log('✅ Local JSON database ready (MongoDB not required)');
  return true;
}
async function saveSessionToMongoDB(number, credentials) {
  try {
    const db = readDb(), n = clean(number), now = new Date().toISOString();
    const old = db.sessions.find(x => x.number === n);
    if (old) { old.credentials = credentials; old.updatedAt = now; }
    else db.sessions.push({ number: n, credentials, createdAt: now, updatedAt: now });
    writeDb(db); return true;
  } catch (e) { console.error('Session save failed:', e.message); return false; }
}
async function getSessionFromMongoDB(number) {
  try { const x = readDb().sessions.find(x => x.number === clean(number)); return x ? x.credentials : null; }
  catch (e) { console.error('Session read failed:', e.message); return null; }
}
async function deleteSessionFromMongoDB(number) {
  try { const db = readDb(), n = clean(number); db.sessions = db.sessions.filter(x => x.number !== n); db.activeNumbers = db.activeNumbers.filter(x => x.number !== n); writeDb(db); return true; }
  catch (e) { console.error('Session delete failed:', e.message); return false; }
}
const defaultConfig = () => ({
  AUTO_RECORDING: 'false', AUTO_TYPING: 'false', ANTI_CALL: 'false',
  REJECT_MSG: '*🔕 Your call was automatically rejected!*',
  READ_MESSAGE: 'false', AUTO_VIEW_STATUS: 'true', AUTO_LIKE_STATUS: 'true',
  AUTO_STATUS_REPLY: 'false', AUTO_STATUS_MSG: 'Hello from Chathuwa',
  AUTO_LIKE_EMOJI: ['❤️', '👍', '😮', '😎']
});
async function getUserConfigFromMongoDB(number) {
  try {
    const db = readDb(), n = clean(number), item = db.userConfigs.find(x => x.number === n);
    if (item) return clone(item.config);
    const config = defaultConfig();
    db.userConfigs.push({ number: n, config, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    writeDb(db); return config;
  } catch (e) { console.error('Config read failed:', e.message); return defaultConfig(); }
}
async function updateUserConfigInMongoDB(number, newConfig) {
  try {
    const db = readDb(), n = clean(number), now = new Date().toISOString();
    const item = db.userConfigs.find(x => x.number === n);
    if (item) { item.config = newConfig; item.updatedAt = now; }
    else db.userConfigs.push({ number: n, config: newConfig, createdAt: now, updatedAt: now });
    writeDb(db); return true;
  } catch (e) { console.error('Config update failed:', e.message); return false; }
}
async function saveOTPToMongoDB(number, otp, config) {
  try {
    const db = readDb(), n = clean(number);
    db.otps = db.otps.filter(x => x.number !== n);
    db.otps.push({ number: n, otp: String(otp), config, expiresAt: Date.now() + 5 * 60 * 1000 });
    writeDb(db); return true;
  } catch (e) { console.error('OTP save failed:', e.message); return false; }
}
async function verifyOTPFromMongoDB(number, otp) {
  try {
    const db = readDb(), n = clean(number), now = Date.now();
    const i = db.otps.findIndex(x => x.number === n && x.otp === String(otp) && x.expiresAt > now);
    if (i < 0) return { valid: false, error: 'Invalid or expired OTP' };
    const [record] = db.otps.splice(i, 1); writeDb(db);
    return { valid: true, config: record.config };
  } catch (e) { console.error('OTP verify failed:', e.message); return { valid: false, error: 'Verification error' }; }
}
async function addNumberToMongoDB(number) {
  try {
    const db = readDb(), n = clean(number), item = db.activeNumbers.find(x => x.number === n);
    if (item) { item.lastConnected = new Date().toISOString(); item.isActive = true; }
    else db.activeNumbers.push({ number: n, lastConnected: new Date().toISOString(), isActive: true });
    writeDb(db); return true;
  } catch (e) { console.error('Active number save failed:', e.message); return false; }
}
async function removeNumberFromMongoDB(number) {
  try { const db = readDb(), n = clean(number); db.activeNumbers = db.activeNumbers.filter(x => x.number !== n); writeDb(db); return true; }
  catch (e) { console.error('Active number delete failed:', e.message); return false; }
}
async function getAllNumbersFromMongoDB() {
  try { return readDb().activeNumbers.filter(x => x.isActive).map(x => x.number); }
  catch (e) { console.error('Active number list failed:', e.message); return []; }
}
async function incrementStats(number, field) {
  try {
    const db = readDb(), n = clean(number), date = new Date().toISOString().slice(0, 10);
    const allowed = ['commandsUsed', 'messagesReceived', 'messagesSent', 'groupsInteracted'];
    if (!allowed.includes(field)) return;
    let item = db.stats.find(x => x.number === n && x.date === date);
    if (!item) { item = { number: n, date, commandsUsed: 0, messagesReceived: 0, messagesSent: 0, groupsInteracted: 0 }; db.stats.push(item); }
    item[field] = (item[field] || 0) + 1; writeDb(db);
  } catch (e) { console.error('Stats update failed:', e.message); }
}
async function getStatsForNumber(number) {
  try { return readDb().stats.filter(x => x.number === clean(number)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,30); }
  catch (e) { console.error('Stats read failed:', e.message); return []; }
}
// Legacy model placeholders kept for import compatibility.
module.exports = {
  connectdb, Session: {}, UserConfig: {}, OTP: {}, ActiveNumber: {}, Stats: {},
  saveSessionToMongoDB, getSessionFromMongoDB, deleteSessionFromMongoDB,
  getUserConfigFromMongoDB, updateUserConfigInMongoDB,
  saveOTPToMongoDB, verifyOTPFromMongoDB,
  addNumberToMongoDB, removeNumberFromMongoDB, getAllNumbersFromMongoDB,
  incrementStats, getStatsForNumber,
  getUserConfig: async number => (await getUserConfigFromMongoDB(number)) || {},
  updateUserConfig: updateUserConfigInMongoDB
};

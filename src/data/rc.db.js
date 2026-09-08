const path = require('path');
const JsonDB = require('../utils/jsondb');

const rcPath = path.resolve(__dirname, '../../rc.json');
const db = new JsonDB(rcPath, {});

function getRcConfig() {
    return db.load();
}

function saveRcConfig(data) {
    db.save(data);
}

module.exports = {
    getRcConfig,
    saveRcConfig
};

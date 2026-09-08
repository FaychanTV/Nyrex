const path = require('path');
const JsonDB = require('../utils/jsondb');

const notifPath = path.resolve(__dirname, '../../custom_notifs.json');
const db = new JsonDB(notifPath, {});

function getCustomNotifs() {
    return db.load();
}

function saveCustomNotifs(data) {
    db.save(data);
}

module.exports = {
    getCustomNotifs,
    saveCustomNotifs
};

const db = require("../db");

function notify(userId, text, type = "general", link = null) {
  db.prepare("INSERT INTO notifications (user_id, text, type, link) VALUES (?, ?, ?, ?)").run(userId, text, type, link);
}

module.exports = { notify };

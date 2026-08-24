const db = require("../db");

function notify(userId, text, type = "general") {
  db.prepare("INSERT INTO notifications (user_id, text, type) VALUES (?, ?, ?)").run(userId, text, type);
}

module.exports = { notify };
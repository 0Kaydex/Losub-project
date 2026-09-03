const db = require("../db");

// groupId is optional — pass it whenever the notification is about a specific group
// (invite, access-link update, payment reminder, group message, etc.) so pages like
// group.html can filter the feed down to just that group's notifications.
function notify(userId, text, type = "general", link = null, groupId = null) {
  db.prepare(
    "INSERT INTO notifications (user_id, text, type, link, group_id) VALUES (?, ?, ?, ?, ?)"
  ).run(userId, text, type, link, groupId);
}

module.exports = { notify };

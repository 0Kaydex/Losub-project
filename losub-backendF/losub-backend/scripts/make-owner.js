const db = require("../db");

console.log("Database:", require("path").resolve(__dirname, "../losub.db"));

const users = db
  .prepare("SELECT id, fullname, email, role FROM users")
  .all();

if (users.length === 0) {
  console.log("❌ The users table is empty.");
} else {
  console.table(users);
}
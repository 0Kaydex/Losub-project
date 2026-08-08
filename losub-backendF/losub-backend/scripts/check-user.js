const db = require("../db");

const users = db
  .prepare("SELECT id, fullname, email, role FROM users")
  .all();

console.log(users);
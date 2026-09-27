const sqlite3 = require("sqlite3");

const db = new sqlite3.Database("./losub-production-backup.db", (err) => {
  if (err) {
    console.error("DATABASE OPEN ERROR:");
    console.error(err);
    process.exit(1);
  }

  console.log("SQLite database opened successfully.");
});

db.all(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  (err, rows) => {
    if (err) {
      console.error("TABLE QUERY ERROR:");
      console.error(err);
      db.close();
      process.exit(1);
    }

    console.log("\nTABLES:");
    console.table(rows);

    db.close((closeErr) => {
      if (closeErr) {
        console.error("DATABASE CLOSE ERROR:");
        console.error(closeErr);
        process.exit(1);
      }

      console.log("\nDatabase check completed successfully.");
    });
  }
);
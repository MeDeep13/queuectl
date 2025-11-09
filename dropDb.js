const mongoose = require("mongoose");
require("dotenv").config();

async function dropDB() {
  await mongoose.connect(process.env.DB_URL);
  await mongoose.connection.dropDatabase();
  console.log("Database dropped!");
  process.exit(0);
}

dropDB();

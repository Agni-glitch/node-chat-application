const mongoose = require("mongoose");
const config = require("./env");

mongoose.set("strictQuery", true);

const db = mongoose.connection;
db.on("connected", () => console.log("[db] connected"));
db.on("disconnected", () => console.warn("[db] disconnected"));
db.on("error", (err) => console.error("[db] error:", err.message));

async function connectDB() {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !config.isProduction || process.env.MONGO_AUTO_INDEX === "true",
  });
  return db;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB, db };

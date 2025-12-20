const mongoose = require("mongoose");
mongoose.connect(process.env.CONN_STRING);
const db = mongoose.connection;
db.on("connected", () => {
  console.log("DB Connection Successful");
});
db.on("err", () => {
  console.log("DB Connection Failed");
});

module.exports = db;

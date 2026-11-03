const config = require("../config/env");

function notFound(req, res) {
  res.status(404).send({ message: `Route not found: ${req.method} ${req.originalUrl}`, success: false });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  } else if (err.name === "CastError") {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = "Resource already exists";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Malformed JSON body";
  }

  if (status >= 500) {
    console.error("[error]", err);
    if (config.isProduction && !err.expose) message = "Internal server error";
  }

  res.status(status).send({ message, success: false });
}

module.exports = { notFound, errorHandler };

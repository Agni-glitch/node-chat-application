const jwt = require("jsonwebtoken");
const config = require("../config/env");
const User = require("../model/user");

class AuthError extends Error {}

function signToken(user) {
  return jwt.sign({ userId: user._id.toString(), tv: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verifies the JWT and that the account still exists, is verified, and hasn't
 * reset its password since the token was issued. Resolves to the user id.
 */
async function authenticate(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AuthError("Session expired, please log in again");
  }
  if (!decoded?.userId) throw new AuthError("Session expired, please log in again");
  const user = await User.findById(decoded.userId).select("+tokenVersion emailVerified").lean();
  if (!user || !user.emailVerified || (user.tokenVersion || 0) !== (decoded.tv || 0)) {
    throw new AuthError("Session expired, please log in again");
  }
  return decoded.userId;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).send({ message: "Authentication required", success: false });
  }
  try {
    req.userId = await authenticate(token);
    return next();
  } catch (err) {
    if (err instanceof AuthError) return res.status(401).send({ message: err.message, success: false });
    return next(err);
  }
}

module.exports = authMiddleware;
module.exports.authenticate = authenticate;
module.exports.signToken = signToken;
module.exports.AuthError = AuthError;

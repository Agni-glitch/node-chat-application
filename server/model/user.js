const mongoose = require("mongoose");
const { PLATFORMS } = require("../utils/socialLinks");

const socialLinksSchema = new mongoose.Schema(
  Object.fromEntries(Object.keys(PLATFORMS).map((p) => [p, { type: String, maxlength: 300 }])),
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstname: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: 50,
    },
    lastname: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    profilePic: {
      type: String,
      required: false,
    },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },
    // Accounts can only log in once the email is verified with an OTP.
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Set while unverified; the TTL index removes abandoned sign-ups.
    expiresAt: {
      type: Date,
      select: false,
    },
    // Bumped on password reset to invalidate every existing session.
    tokenVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.expiresAt;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("users", userSchema);

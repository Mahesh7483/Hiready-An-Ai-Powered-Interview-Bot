const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    default: null // null for Google/Firebase-only accounts
  },
  firebaseUid: {
    type: String,
    index: {
      unique: true,
      // Only enforce uniqueness for actual string uids — ignore null/absent
      partialFilterExpression: { firebaseUid: { $type: "string" } }
    }
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    index: true
  }
});

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    firstName: String,
    lastName: String,
    gender: String,
    courseYear: { type: String }, // For students only: e.g., "BSIT 3rd Year"
    role: { 
      type: String, 
      enum: ["student", "faculty", "staff", "admin", "clinic_staff"],
      required: true,
      lowercase: true 
    },
    email: { type: String, required: true, unique: true },
    idNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    emailUpdates: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
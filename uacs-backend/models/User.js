const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    firstName: String,
    lastName: String,
    gender: String,
    // Academic Information (Structured)
    department: { type: String }, // Department code: CCS, COED, CBAA, etc.
    course: { type: String }, // Course code: BSIT, BSCS, BSED, etc.
    yearLevel: { type: Number, min: 1, max: 5 }, // 1-5
    section: { type: String }, // Optional: A, B, C, 1, 2, etc.
    // Legacy field for backwards compatibility (auto-generated)
    courseYear: { type: String }, // Deprecated: Use course + yearLevel + section instead
    role: { 
      type: String, 
      enum: ["student", "faculty", "staff", "admin", "clinic_staff"],
      required: true,
      lowercase: true 
    },
    email: { type: String, required: true, unique: true },
    idNumber: { type: String, required: false, unique: true, sparse: true },
    password: { type: String, required: true },
    emailUpdates: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,
    // Email change verification
    pendingEmail: String,
    emailChangeToken: String,
    emailChangeTokenExpiry: Date,
    // Password change verification
    pendingPassword: String,
    passwordChangeToken: String,
    passwordChangeTokenExpiry: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");

// Authentication routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/verify-email", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerification);
router.get("/verify", auth, authController.verifyToken);
router.post("/logout", auth, authController.logout);

// Profile management routes
router.put("/profile", auth, authController.updateProfile);
router.post("/change-password", auth, authController.changePassword);

// Password reset routes (forgot password)
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

// Verification routes for profile changes
router.post("/verify-email-change/:token", authController.verifyEmailChange);
router.post("/verify-password-change/:token", authController.verifyPasswordChange);

// Quick fix: Trigger auto-population for all users with missing departments
router.post("/fix-departments", authController.fixDepartments);

module.exports = router;
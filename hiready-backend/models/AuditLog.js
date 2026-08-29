const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  adminEmail: { type: String, default: '' },
  action: { type: String, required: true }, // e.g. 'question.create', 'user.deactivate'
  target: { type: String, default: '' },   // e.g. 'Question:665f...' 
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
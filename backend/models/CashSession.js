import mongoose from 'mongoose';

const movementSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  note: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const cashSessionSchema = new mongoose.Schema({
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  openingAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  withdrawals: { type: [movementSchema], default: [] },
  counted: { type: mongoose.Schema.Types.Mixed, default: null },
  inflows: { type: mongoose.Schema.Types.Mixed, default: null },
  expected: { type: mongoose.Schema.Types.Mixed, default: null },
  differences: { type: mongoose.Schema.Types.Mixed, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
}, { timestamps: true, optimisticConcurrency: true });

cashSessionSchema.index({ dateKey: 1 }, { unique: true });

export default mongoose.model('CashSession', cashSessionSchema);

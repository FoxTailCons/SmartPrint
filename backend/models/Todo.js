import mongoose from 'mongoose';

const todoSchema = new mongoose.Schema(
  {
    activity: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'archived'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Todo', todoSchema);
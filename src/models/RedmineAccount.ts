import mongoose from 'mongoose';

const redmineAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthorizedUser', unique: true, required: true },
  redmineUrl: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  sessionCookie: { type: String },
  lastLogin: { type: Date }
});

export const RedmineAccount = mongoose.model('RedmineAccount', redmineAccountSchema);

import mongoose from 'mongoose';

const redmineAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthorizedUser', unique: true, required: true },
  redmineUrl: { type: String, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
  sessionCookie: { type: String },
  lastLogin: { type: Date },
  redmineApiKey: { type: String, default: "" },
  watchedProjectIds: { type: [String], default: [] },
  namingTemplate: { type: String, default: "" },
  redmineUserId: { type: Number },
  login: { type: String },
  admin: { type: Boolean, default: false },
  firstname: { type: String },
  lastname: { type: String },
  createdOn: { type: Date },
  updatedOn: { type: Date },
  lastLoginOn: { type: Date },
  passwdChangedOn: { type: Date },
  twofaScheme: { type: String, default: null },
  customFields: { type: mongoose.Schema.Types.Mixed, default: [] }
});

export const RedmineAccount = mongoose.model('RedmineAccount', redmineAccountSchema);

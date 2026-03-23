import mongoose from "mongoose";
const Schema = mongoose.Schema;

const visitorSchema = new Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'visitors',
  versionKey: false
});


export const Visitor = mongoose.model('Visitor', visitorSchema);

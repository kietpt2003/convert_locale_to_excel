import mongoose from "mongoose";

const Schema = mongoose.Schema;

const apiUsageSchema = new Schema(
  {
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 1,
    },
  },
  {
    collection: "api_usages",
    versionKey: false,
  }
);

apiUsageSchema.index(
  { endpoint: 1, method: 1, date: 1 },
  { unique: true }
);

export const ApiUsage = mongoose.model("ApiUsage", apiUsageSchema);
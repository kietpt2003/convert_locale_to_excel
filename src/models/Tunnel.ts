import mongoose from "mongoose";


const tunnelSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      unique: true,
      default: "ai-agent",
    },
    url: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);


const Tunnel = mongoose.model("Tunnel", tunnelSchema);


export default Tunnel;



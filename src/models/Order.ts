import mongoose, { Document, Schema } from "mongoose";
import { ORDER_STATUS, PAYMENT_METHOD } from "../constants/order.js";
import { PREMIUM_PLAN_ENUM } from "../constants/premiumPlan.js";

// 1. Định nghĩa Interface định kiểu dữ liệu cho Document dữ liệu Order
export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  amount: number;
  planType: PREMIUM_PLAN_ENUM;
  orderId: string;
  paypalCaptureId: string;
  status: ORDER_STATUS;
  paymentMethod: PAYMENT_METHOD;
  createdAt: Date;
  updatedAt: Date;
}

// 2. Xây dựng cấu trúc Mongoose Schema
const orderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "AuthorizedUser",
      required: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    planType: {
      type: String,
      enum: Object.values(PREMIUM_PLAN_ENUM),
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    paymentMethod: {
      type: Number,
      enum: Object.values(PAYMENT_METHOD).filter(value => typeof value === 'number'),
      required: true
    },
    paypalCaptureId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: Number,
      enum: Object.values(ORDER_STATUS).filter(value => typeof value === 'number'),
      default: ORDER_STATUS.COMPLETE,
    },
  },
  {
    timestamps: true,
  }
);

// 3. Khởi tạo và Export Model
export const Order = mongoose.model<IOrder>("Order", orderSchema);

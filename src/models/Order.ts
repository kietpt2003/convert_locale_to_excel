import mongoose, { Document, Schema } from "mongoose";

// 1. Định nghĩa Interface định kiểu dữ liệu cho Document dữ liệu Order
export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  payerName: string;
  payerEmail: string;
  usdAmount: number;
  planType: "DAILY" | "MONTHLY" | "YEARLY" | "LIFETIME";
  paypalOrderId: string;
  paypalCaptureId: string;
  status: "COMPLETED" | "FAILED" | "REFUNDED";
  createdAt: Date;
  updatedAt: Date;
}

// 2. Xây dựng cấu trúc Mongoose Schema
const orderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "AuthorizedUser", // Liên kết chính xác với tên bảng User hiện tại của bạn
      required: true,
    },
    payerName: {
      type: String,
      required: true,
      trim: true,
    },
    payerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // Tự động biến email sang chữ thường để dễ đồng bộ cứu dữ liệu
    },
    usdAmount: {
      type: Number,
      required: true,
    },
    planType: {
      type: String,
      enum: ["DAILY", "MONTHLY", "YEARLY", "LIFETIME"], // Chỉ cho phép mua 4 gói trả phí này
      required: true,
    },
    paypalOrderId: {
      type: String,
      required: true,
      unique: true, // Khóa duy nhất toàn sàn để chặn đứng 100% việc hack spam gửi trùng hóa đơn
      trim: true,
    },
    paypalCaptureId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "FAILED", "REFUNDED"],
      default: "COMPLETED", // Mặc định là hoàn thành vì Front-end đã capture thành công trước đó
    },
  },
  {
    timestamps: true, // Tự động tạo và quản lý 2 cột dữ liệu thông minh: createdAt và updatedAt
  }
);

// 3. Khởi tạo và Export Model
export const Order = mongoose.model<IOrder>("Order", orderSchema);

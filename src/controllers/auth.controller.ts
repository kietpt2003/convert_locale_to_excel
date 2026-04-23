import { Request, Response } from 'express';
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

import { AuthorizedUser } from '../models/AuthorizedUser.js';

export const handleSignIn = async (req: Request, res: Response) => {
  try {
    // Khi chạy ux_mode: "redirect", Google sẽ gửi token trong field tên là "credential"
    // Ta vẫn giữ `req.body.token` để tương thích ngược nếu có hàm nào gọi kiểu cũ
    const googleIdToken = req.body.credential || req.body.token;

    if (!googleIdToken) {
      return res.redirect('/#error=missing_token');
    }

    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return res.redirect('/#error=invalid_token');

    const email = payload.email;

    let authUser = await AuthorizedUser.findOne({ email });

    if (!authUser) {
      if (email === process.env.ADMIN_EMAIL) {
        authUser = await AuthorizedUser.create({ email, role: "admin" });
      } else {
        // Redirect về Frontend kèm mã lỗi
        return res.redirect('/#error=access_denied');
      }
    }

    // Generate Custom JWT Token của bạn
    const customToken = jwt.sign(
      {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: authUser.role
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    // QUAN TRỌNG: Dùng res.redirect để đá người dùng về lại trang web
    // Gắn customToken vào dạng Hash (#) trên URL để bảo mật hơn param (?)
    res.redirect(`/#token=${customToken}`);

  } catch (error) {
    console.error("Auth error:", error);
    res.redirect('/#error=auth_failed');
  }
};

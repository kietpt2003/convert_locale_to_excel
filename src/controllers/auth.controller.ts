import { Request, Response } from 'express';
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

import { AuthorizedUser } from '../models/AuthorizedUser.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const JWT_SECRET = process.env.JWT_SECRET;

export const handleSignIn = async (req: Request, res: Response) => {
  const redirectWithoutHistory = (url: string) => {
    return res.send(`
      <html>
        <body>
          <script>
            window.location.replace("${url}");
          </script>
        </body>
      </html>
    `);
  };
  try {
    const googleIdToken = req.body.credential || req.body.token;

    if (!googleIdToken) {
      return redirectWithoutHistory('/#error=missing_token');
    }

    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return redirectWithoutHistory('/#error=invalid_token')
    }

    const email = payload.email;

    let authUser = await AuthorizedUser.findOne({ email });

    if (!authUser) {
      if (email === ADMIN_EMAIL) {
        authUser = await AuthorizedUser.create({ email, role: "admin" });
      } else {
        return redirectWithoutHistory('/#error=access_denied');
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
      JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    return redirectWithoutHistory(`/#token=${customToken}`);
  } catch (error) {
    console.error("Auth error:", error);
    return redirectWithoutHistory('/#error=auth_failed');
  }
};

export const handleSignInV2 = async (req: Request, res: Response) => {
  // Lấy địa chỉ Frontend từ biến môi trường (Mặc định là 3000 nếu chưa set)
  const frontendUrl = FRONTEND_URL || 'http://localhost:3000';

  // Sửa lại helper: Nối frontendUrl vào trước đường dẫn
  const redirectWithoutHistory = (path: string) => {
    return res.send(`
      <html>
        <body>
          <script>
            window.location.replace("${frontendUrl}${path}");
          </script>
        </body>
      </html>
    `);
  };

  try {
    const googleIdToken = req.body.credential || req.body.token;

    if (!googleIdToken) {
      return redirectWithoutHistory('/#error=missing_token');
    }

    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return redirectWithoutHistory('/#error=invalid_token')
    }

    const email = payload.email;

    let authUser = await AuthorizedUser.findOne({ email });

    if (!authUser) {
      if (email === ADMIN_EMAIL) {
        authUser = await AuthorizedUser.create({ email, role: "admin" });
      } else {
        return redirectWithoutHistory('/#error=access_denied');
      }
    }

    // Generate Custom JWT Token
    const customToken = jwt.sign(
      {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: authUser.role
      },
      JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    // Nó sẽ thành: http://localhost:3000/#token=...
    return redirectWithoutHistory(`/#token=${customToken}`);
  } catch (error) {
    console.error("Auth error:", error);
    return redirectWithoutHistory('/#error=auth_failed');
  }
};

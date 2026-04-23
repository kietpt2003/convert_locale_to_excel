import { Request, Response } from 'express';
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

import { AuthorizedUser } from '../models/AuthorizedUser.js';

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

    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await googleClient.verifyIdToken({
      idToken: googleIdToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return redirectWithoutHistory('/#error=invalid_token')
    }

    const email = payload.email;

    let authUser = await AuthorizedUser.findOne({ email });

    if (!authUser) {
      if (email === process.env.ADMIN_EMAIL) {
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
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    return redirectWithoutHistory(`/#token=${customToken}`);
  } catch (error) {
    console.error("Auth error:", error);
    return redirectWithoutHistory('/#error=auth_failed');
  }
};

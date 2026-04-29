import axios from "axios";

import { RedmineAccount } from "../models/RedmineAccount.js";
import { performRedmineLogin } from "../controllers/redmine.controller.js";
import { AuthorizedUser } from "../models/AuthorizedUser.js";
import { REDMINE_AUTHEN_ERROR } from "../constants/redmine.js";

export const redmineInterceptor = async (req: any, res: any, next: any) => {
  const user = await AuthorizedUser.findOne({ email: req.user.email });
  if (!user || !user.redmineApiKey || !user.redmineUrl) {
    return res.status(400).json({ message: "Missing Redmine Configuration" });
  }

  const account = await RedmineAccount.findOne({ userId: user?.id });
  req.redmineAccount = account;

  res.fetchRedmine = async (targetUrl: string) => {
    if (!account) throw new Error(REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED);

    const executeRequest = async (cookie: string) => {
      const response = await axios.get(targetUrl, {
        headers: {
          'Cookie': cookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        maxRedirects: 0, // Block redirect or catching status 302
        validateStatus: (status) => status === 200
      });

      // Check Redmine content if response status 200 but still login screen
      if (response.data.includes('id="login-form"')) {
        throw { response: { status: 302 } };
      }
      return response;
    };

    try {
      // First try: Use current cookie
      return await executeRequest(account.sessionCookie || "");
    } catch (error: any) {
      // If session expired (Redmine redirect to login screen)
      if (error.response?.status === 302 || error.response?.status === 301) {
        console.log(`[Auto-Retry] Session expired. Đang tự động login lại...`);

        try {
          // Try to login again
          const newCookie = await performRedmineLogin(account);

          // Retry the request: 
          console.log(`[Auto-Retry] Login thành công. Thực hiện lại request...`);
          return await executeRequest(newCookie);

        } catch (loginError: any) {
          // If try again still not working (Due to change password Redmine), throw error and ask the user to login again
          throw new Error(REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED);
        }
      }
      // Other error
      throw error;
    }
  };

  next();
};
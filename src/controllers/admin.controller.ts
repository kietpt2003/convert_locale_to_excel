import { Request, Response } from 'express';

import { AuthorizedUser } from '../models/AuthorizedUser.js';

export const getAdminInfo = async (_req: Request, res: Response) => {
  try {
    const users = await AuthorizedUser.find().sort({ createdAt: -1 });
    const adminEmail = process.env.ADMIN_EMAIL;

    const formattedUsers = users.map(u => ({
      email: u.email,
      role: u.email === adminEmail ? "super_admin" : u.role,
      createdAt: u.createdAt
    }));

    res.json(formattedUsers);
  } catch (err) {
    res.status(500).json({ message: "Cannot get user list" });
  }
}

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: "Email cannot empty" });

    const exists = await AuthorizedUser.exists({ email });
    if (exists) return res.status(400).json({ message: "Email existed" });

    await AuthorizedUser.create({ email, role: role || "user" });
    res.json({ message: "Add user success" });
  } catch (err) {
    res.status(500).json({ message: "Create user failed." });
  }
}

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const targetEmail = req.params.email;
    const requesterEmail = (req as any).user.email;

    if (targetEmail === process.env.ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot delete Super Admin" });
    }

    if (targetEmail === requesterEmail) {
      return res.status(400).json({ message: "Cannot remove your permisison. Please contact Super Admin or IT Support!" });
    }

    const targetUser = await AuthorizedUser.findOne({ email: targetEmail });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (targetUser.role === "admin" && requesterEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ message: "Only Super Admin can delete other admin!" });
    }

    await AuthorizedUser.deleteOne({ email: targetEmail });
    res.json({ message: "Delete user success" });
  } catch (err) {
    res.status(500).json({ message: "Delete user failed." });
  }
}

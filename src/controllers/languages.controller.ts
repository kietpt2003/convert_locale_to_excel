import { Request, Response } from 'express';

import { Language } from '../models/Language.js';

export const getLanguages = async (req: Request, res: Response) => {
  try {
    const langs = await Language.find().sort({ name: 1 });
    res.json(langs);
  } catch (err) {
    res.status(500).json({ message: "Cannot get languages" });
  }
}

export const createLanguages = async (req: Request, res: Response) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Code and Name cannot be empty" });

    const normalizedCode = code.trim().toLowerCase();
    const exists = await Language.exists({ code: normalizedCode });
    if (exists) return res.status(400).json({ message: "This language code already exists" });

    await Language.create({ code: normalizedCode, name: name.trim() });
    res.json({ message: "Language added successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to add language" });
  }
}

export const deleteLanguage = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    await Language.deleteOne({ code });
    res.json({ message: "Language deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete language" });
  }
}
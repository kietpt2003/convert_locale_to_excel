import { Response } from 'express';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { RedmineAccount } from '../models/RedmineAccount.js';
import { InvalidProjectIds, parseProjectIds } from '../utils/projectIds.js';

async function favorites(req: any, res: Response, method: 'GET' | 'POST' | 'PATCH') {
  try {
    const ids = method === 'GET' ? undefined : parseProjectIds(req.body?.projectIds);
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const account = method === 'GET'
      ? await RedmineAccount.findOne({ userId: user._id }).select('favoriteProjectIds')
      : await RedmineAccount.findOneAndUpdate({ userId: user._id }, method === 'POST'
        ? { $addToSet: { favoriteProjectIds: { $each: ids! } } }
        : { $set: { favoriteProjectIds: ids! } }, { new: true, runValidators: true }).select('favoriteProjectIds');
    if (!account) return res.status(400).json({ message: 'Missing Redmine Configuration' });
    return res.json({ projectIds: [...(account.favoriteProjectIds || [])].sort((a, b) => a - b) });
  } catch (error) {
    if (error instanceof InvalidProjectIds) return res.status(400).json({ message: error.message });
    return res.status(500).json({ message: 'Failed to access favorite projects' });
  }
}

export const getFavoriteProjects = (req: any, res: Response) => favorites(req, res, 'GET');
export const addFavoriteProjects = (req: any, res: Response) => favorites(req, res, 'POST');
export const updateFavoriteProjects = (req: any, res: Response) => favorites(req, res, 'PATCH');

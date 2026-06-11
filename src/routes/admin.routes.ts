import { Router } from 'express';

import { verifyAdmin, verifyToken } from '../middleware/validation.js';
import {
  createAdmin,
  deleteUser,
  getAdminInfo,
  getRedmineUserInfo,
  grantUserPremium,
  revokeUserPremium
} from '../controllers/admin.controller.js';

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get('/users', getAdminInfo);
router.get('/user/redmine', getRedmineUserInfo);
router.post('/users', createAdmin);
router.delete('/users/:email', deleteUser);
router.post('/users/grant-premium', grantUserPremium);
router.post('/users/revoke-premium', revokeUserPremium);

export default router;
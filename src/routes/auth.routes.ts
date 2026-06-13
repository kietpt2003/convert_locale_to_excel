import { Router } from 'express';

import { getUserInfo, handleSignIn, handleSignInV2 } from '../controllers/auth.controller.js';
import { verifyToken } from '../middleware/validation.js';

const router = Router();

router.post('/google', handleSignIn);
router.post('/v2/google', handleSignInV2);
router.get('/me', verifyToken, getUserInfo);

export default router;
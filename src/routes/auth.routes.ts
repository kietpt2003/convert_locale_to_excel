import { Router } from 'express';

import { handleSignIn, handleSignInV2 } from '../controllers/auth.controller.js';

const router = Router();

router.post('/google', handleSignIn);
router.post('/v2/google', handleSignInV2);

export default router;
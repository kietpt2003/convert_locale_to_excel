import { Router } from 'express';

import { handleSignIn } from '../controllers/auth.controller.js';

const router = Router();

router.post('/google', handleSignIn);

export default router;
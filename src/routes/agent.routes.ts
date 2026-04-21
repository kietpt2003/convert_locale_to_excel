import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import { getAgentUrl } from '../controllers/agent.controller.js';

const router = Router();

router.use(verifyToken);

router.get('/get-agent-url', getAgentUrl);

export default router;
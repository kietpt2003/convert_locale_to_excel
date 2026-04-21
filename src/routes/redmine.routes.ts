import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import {
  createSubTask,
  createTask,
  getListProjects,
  getMonthlyHours,
  getRedmineConfig,
  getTaskActivities,
  getTaskParents,
  getTaskPriorities,
  getTasks,
  getTaskStatuses,
  getTaskTrackers,
  getUserInfo,
  logTime
} from '../controllers/redmine.controller.js';

const router = Router();

router.use(verifyToken);

router.post('/logtime', logTime);
router.get('/projects/:projectId/tasks', getTasks);
router.post('/tasks', createTask);
router.get('/priorities', getTaskPriorities);
router.get('/activities', getTaskActivities);
router.get('/statuses', getTaskStatuses);
router.get('/monthly-status', getMonthlyHours);
router.post('/create-subtask', createSubTask);
router.get('/trackers', getTaskTrackers);
router.get('/scan-parents', getTaskParents);
router.get('/projects', getListProjects);
router.get('/user/me', getUserInfo);
router.get('/user/redmine-config', getRedmineConfig);

export default router;
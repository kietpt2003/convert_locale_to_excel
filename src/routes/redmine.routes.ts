import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import { redmineInterceptor } from '../middleware/redmine.js'; // THÊM IMPORT NÀY
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
  logTime,
  getProjectTaskTree,
  setupRedmineAccount,
  getUsersFromReportHTML,
  getNewTaskOptions
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
router.post('/user/redmine-config', getRedmineConfig);
router.get('/projects/tasks', getProjectTaskTree);
router.post('/login', setupRedmineAccount);
router.get('/user/all', redmineInterceptor, getUsersFromReportHTML);
router.get('/projects/:project_id/task-options', redmineInterceptor, getNewTaskOptions);

export default router;
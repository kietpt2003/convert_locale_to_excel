import { Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import qs from 'qs';
import CryptoJS from 'crypto-js';
import dotenv from "dotenv";

import { ACCOUNT_AUTHEN_ERROR, REDMINE_AUTHEN_ERROR, REDMINE_LOG_TIME_ACTIVITY, REDMINE_PROJECT_STATUS, REDMINE_TASK_TRACKER_ID } from '../constants/redmine.js';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { fetchRedmineDataParallel, getTotalLoggedHours, normalizeUrl } from '../utils/redmineUtils.js';
import { RedmineAccount } from '../models/RedmineAccount.js';
import { getRedisClient } from '../index.js';

dotenv.config();

const ENCRYPT_SECRET = process.env.REDMINE_PWD_SECRET || '';

const getRedmineAccount = async (email: string) => {
  const user = await AuthorizedUser.findOne({ email });
  if (!user) throw new Error(ACCOUNT_AUTHEN_ERROR.USER_NOT_FOUND);
  const account = await RedmineAccount.findOne({ userId: user._id });
  return account;
};

export const logTime = async (req: any, res: Response) => {
  try {
    const { issue_id, hours, spent_on, comments, activity_id } = req.body;

    if (!issue_id || !hours || !spent_on) {
      return res.status(400).json({ message: "Missing required fields: issue_id, hours, or spent_on" });
    }

    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey || !account.redmineUrl) {
      return res.status(401).json({ message: "Redmine configuration not found for this user" });
    }

    const logData = {
      time_entry: {
        issue_id: issue_id,
        hours: hours,
        spent_on: spent_on,
        comments: comments || "",
        activity_id: activity_id || REDMINE_LOG_TIME_ACTIVITY.DEVELOPMENT.key,
      }
    };

    const response = await axios.post(
      `${account.redmineUrl}/time_entries.json`,
      logData,
      {
        headers: {
          "X-Redmine-API-Key": account.redmineApiKey,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(201).json({
      message: "Time logged successfully",
      data: response.data.time_entry
    });

  } catch (error: any) {
    if (error.message === ACCOUNT_AUTHEN_ERROR.USER_NOT_FOUND) {
      return res.status(404).json({ message: "User not found" });
    }

    console.error("Log Time Error:", error.response?.data || error.message);

    const redmineErrors = error.response?.data?.errors;
    let errorMessage = "Failed to log time to Redmine";

    if (Array.isArray(redmineErrors)) {
      errorMessage = redmineErrors.join("\n");
    } else if (typeof redmineErrors === 'string') {
      errorMessage = redmineErrors;
    }

    res.status(error.response?.status || 500).json({
      message: errorMessage
    });
  }
};

export const getTasks = async (req: any, res: Response) => {
  try {
    const { projectId } = req.params;
    const account = await getRedmineAccount(req.user.email);

    if (!account || !account.redmineApiKey || !account.redmineUrl) {
      return res.status(401).json({ message: "Missing Redmine Configuration" });
    }

    const commonParams = {
      project_id: projectId,
      status_id: "open",
      limit: 1000,
      include: "custom_fields",
    };

    const [parentRes, myTasksRes] = await Promise.all([
      axios.get(`${account.redmineUrl}/issues.json`, {
        params: { ...commonParams, parent_id: "!*" },
        headers: { "X-Redmine-API-Key": account.redmineApiKey },
      }),
      axios.get(`${account.redmineUrl}/issues.json`, {
        params: { ...commonParams, assigned_to_id: "me" },
        headers: { "X-Redmine-API-Key": account.redmineApiKey },
      }),
    ]);

    const parentIssues = parentRes.data.issues;
    const myIssues = myTasksRes.data.issues;

    const combinedIssues = [...parentIssues];
    myIssues.forEach((myIssue: any) => {
      if (!combinedIssues.find((p) => p.id === myIssue.id)) {
        combinedIssues.push(myIssue);
      }
    });

    const extraParentIds = [...new Set(combinedIssues
      .filter((i: any) => i.parent && i.parent.id)
      .map((i: any) => i.parent.id))];

    const parentMap: Record<number, string> = {};
    combinedIssues.forEach(i => {
      parentMap[i.id] = i.subject;
    });

    const missingParentIds = extraParentIds.filter(id => !parentMap[id]);
    if (missingParentIds.length > 0) {
      const missingResponses = await Promise.all(
        missingParentIds.map(id =>
          axios.get(`${account.redmineUrl}/issues/${id}.json`, {
            headers: { "X-Redmine-API-Key": account.redmineApiKey }
          }).catch(() => null)
        )
      );
      missingResponses.forEach((r: any) => {
        if (r?.data?.issue) {
          parentMap[r.data.issue.id] = r.data.issue.subject;
        }
      });
    }

    const today = new Date().toLocaleDateString('en-CA');

    const tasksWithDetails = await Promise.all(
      combinedIssues.map(async (issue: any) => {
        const loggedToday = await getTotalLoggedHours(account.redmineUrl, issue.id, today, account.redmineApiKey);

        return {
          id: issue.id,
          subject: issue.subject,
          parent: issue.parent ? {
            id: issue.parent.id,
            subject: parentMap[issue.parent.id] || `Task #${issue.parent.id}`
          } : null,
          loggedToday: loggedToday,
          totalSpentHours: issue.spent_hours || 0,
          startDate: issue.start_date || null,
          custom_fields: issue.custom_fields || []
        };
      })
    );

    tasksWithDetails.sort((a, b) => (b.id - a.id));

    res.json({ tasks: tasksWithDetails });
  } catch (error: any) {
    console.error("Fetch combined tasks error:", error.message);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
};

export const createTask = async (req: any, res: Response) => {
  try {
    const { project_id, subject, parent_issue_id, assigned_to_id, tracker_id, custom_fields } = req.body;

    if (!project_id || !subject) {
      return res.status(400).json({ message: "Project ID and Subject are required" });
    }

    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey || !account.redmineUrl) {
      return res.status(401).json({ message: "Missing Redmine Configuration" });
    }

    const issueData: any = {
      issue: {
        project_id: project_id,
        subject: subject,
        parent_issue_id: parent_issue_id || null,
        assigned_to_id: assigned_to_id === "me" ? "me" : assigned_to_id,
        tracker_id: tracker_id || REDMINE_TASK_TRACKER_ID.TASK.key,
      }
    };

    if (custom_fields && Array.isArray(custom_fields)) {
      issueData.issue.custom_fields = custom_fields;
    }

    const response = await axios.post(
      `${account.redmineUrl}/issues.json`,
      issueData,
      {
        headers: {
          "X-Redmine-API-Key": account.redmineApiKey,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(201).json(response.data.issue);

  } catch (error: any) {
    console.error("Create Task Error:", error.response?.data || error.message);

    const redmineErrors = error.response?.data?.errors;
    const msg = Array.isArray(redmineErrors) ? redmineErrors.join(", ") : "Failed to create task";

    res.status(error.response?.status || 500).json({ message: msg });
  }
}

export const getTaskPriorities = async (req: any, res: Response) => {
  try {
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey) {
      return res.status(401).json({ message: "Missing Config" });
    }

    const response = await axios.get(`${account.redmineUrl}/enumerations/issue_priorities.json`, {
      headers: {
        "X-Redmine-API-Key": account.redmineApiKey,
        "Content-Type": "application/json"
      },
    });

    const activePriorities = response.data.issue_priorities.filter((p: any) => p.active);

    res.json({ priorities: activePriorities });
  } catch (error: any) {
    console.error("Fetch Priorities Error:", error.message);
    res.status(500).json({ message: "Failed to fetch issue priorities" });
  }
}

export const getTaskActivities = async (req: any, res: Response) => {
  try {
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey) {
      return res.status(401).json({ message: "Missing Config" });
    }

    const response = await axios.get(`${account.redmineUrl}/enumerations/time_entry_activities.json`, {
      headers: {
        "X-Redmine-API-Key": account.redmineApiKey,
        "Content-Type": "application/json"
      },
    });

    const activeActivities = response.data.time_entry_activities.filter((p: any) => p.active);

    res.json({ activities: activeActivities });
  } catch (error: any) {
    console.error("Fetch Activities Error:", error.message);
    res.status(500).json({ message: "Failed to fetch issue priorities" });
  }
}

export const getTaskStatuses = async (req: any, res: Response) => {
  try {
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey) {
      return res.status(401).json({ message: "Missing Config" });
    }

    const response = await axios.get(`${account.redmineUrl}/issue_statuses.json`, {
      headers: {
        "X-Redmine-API-Key": account.redmineApiKey,
        "Content-Type": "application/json"
      },
    });

    res.json({ statuses: response.data.issue_statuses });
  } catch (error: any) {
    console.error("Fetch Activities Error:", error.message);
    res.status(500).json({ message: "Failed to fetch issue priorities" });
  }
}

export const getMonthlyHours = async (req: any, res: Response) => {
  try {
    const { month, year } = req.query; // Ex: month=4, year=2026
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey) {
      return res.status(401).json({ message: "Missing Config" });
    }

    // Calculate start date and end date of month
    const paddedMonth = String(month).padStart(2, '0');
    const fromDate = `${year}-${paddedMonth}-01`;

    const lastDayOfMonth = new Date(Number(year), Number(month), 0).getDate();
    const toDate = `${year}-${paddedMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const timeEntriesRes = await axios.get(`${account.redmineUrl}/time_entries.json`, {
      params: { user_id: "me", from: fromDate, to: toDate, limit: 1000 },
      headers: { "X-Redmine-API-Key": account.redmineApiKey }
    });

    const entries = timeEntriesRes.data.time_entries;
    const issueIds = [...new Set(entries.map((e: any) => e.issue?.id).filter((id: any) => id))];

    const issueMap: Record<number, string> = {};

    if (issueIds.length > 0) {
      const issuesRes = await axios.get(`${account.redmineUrl}/issues.json`, {
        params: { issue_id: issueIds.join(','), limit: 1000 },
        headers: { "X-Redmine-API-Key": account.redmineApiKey }
      });

      issuesRes.data.issues.forEach((is: any) => {
        issueMap[is.id] = is.subject;
      });
    }

    const dailyData: Record<string, any> = {};

    entries.forEach((entry: any) => {
      const date = entry.spent_on;
      if (!dailyData[date]) {
        dailyData[date] = { totalHours: 0, logs: [] };
      }

      dailyData[date].logs.push({
        id: entry.id,
        hours: entry.hours,
        comments: entry.comments,
        project: entry.project ? entry.project.name : "N/A",
        issueId: entry.issue ? entry.issue.id : null,
        issueName: entry.issue ? (issueMap[entry.issue.id] || "Unknown Task") : "N/A",
        activity: entry.activity ? entry.activity.name : "N/A",
      });

      dailyData[date].totalHours += Number(entry.hours);
    });

    const result = Object.keys(dailyData).reduce((acc: any, date) => {
      acc[date] = {
        totalHours: dailyData[date].totalHours,
        isFull: dailyData[date].totalHours >= 8,
        logs: dailyData[date].logs,
        redmineUrl: account.redmineUrl
      };
      return acc;
    }, {});

    res.json(result);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch monthly log status" });
  }
}

export const createSubTask = async (req: any, res: Response) => {
  try {
    const { parentId, projectId, subject, trackerId } = req.body;
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey) {
      return res.status(401).json({ message: "Missing Config" });
    }

    const response = await axios.post(`${account.redmineUrl}/issues.json`, {
      issue: {
        project_id: projectId,
        parent_issue_id: parentId,
        subject: subject,
        tracker_id: trackerId || REDMINE_TASK_TRACKER_ID.TASK.key,
        assigned_to_id: 'me' // Auto-assign to yourself
      }
    }, {
      headers: { 'X-Redmine-API-Key': account.redmineApiKey }
    });

    res.json({ success: true, issue: response.data.issue });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create sub-task" });
  }
}

export const getTaskTrackers = (req: any, res: Response) => {
  const trackers = Object.values(REDMINE_TASK_TRACKER_ID).map(item => ({
    id: item.key,
    name: item.value
  }));

  res.json(trackers);
}

export const getTaskParents = async (req: any, res: Response) => {
  try {
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.watchedProjectIds || account.watchedProjectIds.length === 0) {
      return res.json({ issues: [] });
    }

    // Lấy ngày hiện tại (định dạng YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA');

    // 1. Lấy danh sách các task cha từ các project đang theo dõi
    const scanPromises = account.watchedProjectIds.map((projectId) =>
      axios.get(`${account.redmineUrl}/issues.json`, {
        params: {
          project_id: projectId,
          parent_id: "!*",
          status_id: "open",
          limit: 20,
        },
        headers: { "X-Redmine-API-Key": account.redmineApiKey },
      })
    );

    const results = await Promise.all(scanPromises);
    const allIssues = results.flatMap((response) => response.data.issues);

    const issuesWithLogCheck = await Promise.all(
      allIssues.map(async (issue: any) => {
        const loggedHours = await getTotalLoggedHours(
          account.redmineUrl,
          issue.id,
          today,
          account.redmineApiKey
        );

        return {
          ...issue,
          currentLoggedHours: loggedHours
        };
      })
    );

    const incompleteTasks = issuesWithLogCheck.filter(
      (issue) => issue.currentLoggedHours < 8
    );

    incompleteTasks.sort((a: any, b: any) =>
      new Date(b.updated_on).getTime() - new Date(a.updated_on).getTime()
    );

    res.json({ issues: incompleteTasks });
  } catch (error: any) {
    console.error("Scan parents error:", error.message);
    res.status(500).json({ message: "Failed to scan and filter issues from Redmine" });
  }
}

export const getListProjects = async (req: any, res: Response) => {
  try {
    const account = await getRedmineAccount(req.user.email);
    if (!account || !account.redmineApiKey || !account.redmineUrl) {
      return res.status(400).json({ message: "Missing Redmine Configuration" });
    }

    const response = await axios.get(`${account.redmineUrl}/projects.json`, {
      headers: { 'X-Redmine-API-Key': account.redmineApiKey },
      params: {
        status: REDMINE_PROJECT_STATUS.ACTIVE,
        limit: 1000,
        sort: "name:asc"
      },
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Redmine Proxy Error:", error.message);
    res.status(500).json({ message: "Cannot connect to Redmine" });
  }
}

export const getUserInfo = async (req: any, res: Response) => {
  try {
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const account = await RedmineAccount.findOne({ userId: user._id });

    const decryptedBytes = CryptoJS.AES.decrypt(account?.password || "", ENCRYPT_SECRET);
    const plainPassword = decryptedBytes.toString(CryptoJS.enc.Utf8);

    if (!plainPassword) {
      throw new Error(REDMINE_AUTHEN_ERROR.DECRYPTION_FAILED);
    }

    res.json({
      email: user.email,
      role: user.role,
      redmineProfile: account?.redmineUserId ? {
        id: account.redmineUserId,
        login: account.login,
        password: plainPassword,
        firstname: account.firstname,
        lastname: account.lastname,
        fullName: `${account.lastname || ''} ${account.firstname || ''}`.trim(),
        admin: account.admin,
        redmineUrl: account?.redmineUrl || "",
        redmineApiKey: account?.redmineApiKey || "",
        watchedProjectIds: account?.watchedProjectIds || [],
        namingTemplate: account?.namingTemplate || "",
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to get user info." });
  }
}

export const getRedmineConfig = async (req: any, res: Response) => {
  try {
    const { watchedProjectIds, namingTemplate } = req.body;
    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Lưu vào RedmineAccount
    const account = await RedmineAccount.findOneAndUpdate(
      { userId: user._id },
      { watchedProjectIds, namingTemplate },
      { new: true }
    );

    res.json({ message: "Configuration updated successfully", data: account });
  } catch (error) {
    console.error("Redmine Config Error:", error);
    res.status(500).json({ message: "Failed to save configuration" });
  }
}

export const getProjectTaskTree = async (req: any, res: Response) => {
  try {
    const { projectName, taskName, taskDate, onlyShowMyTasks } = req.query;

    const forceReload = req.query.reload === 'true';
    const isOnlyMyTasks = req.query.onlyShowMyTasks === 'true';

    const email = req.user.email;
    const account = await getRedmineAccount(email);

    if (!account || !account.redmineApiKey || !account.redmineUrl) {
      return res.status(400).json({ message: "Missing Redmine Configuration" });
    }

    const cacheKey = `tree_cache_${account.redmineApiKey}_${isOnlyMyTasks ? 'mine' : 'all'}`;

    const redis = await getRedisClient();

    if (!forceReload) {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }
    }

    // =========================================================
    // 1. LẤY TẤT CẢ PROJECTS (Dùng hàm helper song song mới)
    // =========================================================
    const allProjects = await fetchRedmineDataParallel(
      `${account.redmineUrl}/projects.json`,
      account.redmineApiKey,
      { status: REDMINE_PROJECT_STATUS.ACTIVE },
      'projects'
    );
    const allProjectIds = new Set(allProjects.map((p: any) => p.id));

    // =========================================================
    // 2. LẤY TASKS (Tất cả hoặc của riêng tôi tùy param)
    // =========================================================
    const taskParams: any = { status_id: "*" }; // Mặc định lấy tất cả các trạng thái

    // Nếu Client truyền onlyShowMyTasks = true thì mới filter theo ID của mình
    if (onlyShowMyTasks === 'true') {
      taskParams.assigned_to_id = "me";
    }

    if (taskDate) taskParams.created_on = taskDate;

    let allTasks = await fetchRedmineDataParallel(
      `${account.redmineUrl}/issues.json`,
      account.redmineApiKey,
      taskParams,
      'issues'
    );

    // --- CẢI TIẾN 1: Tìm kiếm Task theo ID hoặc Name ---
    if (taskName) {
      const tSearch = String(taskName).toLowerCase();
      allTasks = allTasks.filter((t: any) =>
        t.subject.toLowerCase().includes(tSearch) ||
        t.id.toString().includes(tSearch)
      );
    }

    // --- Hàm dựng cây Task ---
    const buildTaskTree = (nodes: any[], parentId: number | null, allIdsInProject: Set<any>): any[] => {
      return nodes
        .filter((t: any) => {
          const pId = t.parent ? t.parent.id : null;
          return parentId === null
            ? (!t.parent || !allIdsInProject.has(t.parent.id))
            : (pId === parentId);
        })
        .map((t: any) => ({
          ...t,
          subtasks: buildTaskTree(nodes, t.id, allIdsInProject)
        }));
    };

    // --- Hàm dựng cây Project ---
    const buildProjectTree = (parentId: number | null): any[] => {
      return allProjects
        .filter((p: any) => {
          const pId = p.parent ? p.parent.id : null;
          return parentId === null
            ? (!p.parent || !allProjectIds.has(p.parent.id))
            : (pId === parentId);
        })
        .map((project: any) => {
          // Bắt các task vào đúng project
          const projectTasks = allTasks.filter((t: any) => t.project.id === project.id);
          const projectTaskIds = new Set(projectTasks.map((t: any) => t.id));

          return {
            id: project.id,
            name: project.name,
            identifier: project.identifier,
            tasks: buildTaskTree(projectTasks, null, projectTaskIds),
            subProjects: buildProjectTree(project.id)
          };
        });
    };

    // 3. Dựng cây toàn bộ
    let projectTree = buildProjectTree(null);

    // --- CẢI TIẾN 2: Lọc đệ quy cho Project ---
    if (projectName || taskName || onlyShowMyTasks === 'true') {
      const pSearch = projectName ? String(projectName).toLowerCase() : "";

      const filterProjectRecursive = (list: any[]): any[] => {
        return list
          .map(p => ({
            ...p,
            subProjects: filterProjectRecursive(p.subProjects)
          }))
          .filter(p => {
            const matchesName = p.name.toLowerCase().includes(pSearch);
            const matchesId = p.id.toString().includes(pSearch);
            const hasTasks = p.tasks.length > 0;
            const hasMatchingChildren = p.subProjects.length > 0;

            // Xử lý giữ lại cây: Nếu có search name thì bắt name. 
            // Nếu không search name (nhưng có lọc task) thì project nào có task mới hiện
            return (projectName && (matchesName || matchesId)) || hasMatchingChildren || hasTasks;
          });
      };
      projectTree = filterProjectRecursive(projectTree);
    }

    await redis.set(cacheKey, JSON.stringify(projectTree), { EX: 300 }); //300s <=> 5 min

    res.json(projectTree);

  } catch (error: any) {
    res.status(500).json({ message: "Failed to get projects tasks" });
  }
};

export const setupRedmineAccount = async (req: any, res: Response) => {
  try {
    const { username, password, redmineUrl: rawRedmineUrl } = req.body;
    const redmineUrl = normalizeUrl(rawRedmineUrl);

    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user || !username || !password || !redmineUrl) {
      return res.status(400).json({ message: "Please enter Company Redmine URL, Username, and Password for Redmine." });
    }

    let fetchedApiKey = "";
    let redmineUserData: any = null;

    try {
      const currentUserRes = await axios.get(`${redmineUrl}/users/current.json`, {
        auth: { username: username, password: password }
      });
      redmineUserData = currentUserRes.data?.user;
      fetchedApiKey = redmineUserData?.api_key || "";
    } catch (apiErr: any) { }

    const encryptedPassword = CryptoJS.AES.encrypt(password, ENCRYPT_SECRET).toString();

    const accountDataToSave: any = {
      username,
      password: encryptedPassword,
      redmineUrl,
    };

    if (redmineUserData) {
      accountDataToSave.redmineApiKey = fetchedApiKey;
      accountDataToSave.redmineUserId = redmineUserData.id;
      accountDataToSave.login = redmineUserData.login;
      accountDataToSave.admin = redmineUserData.admin;
      accountDataToSave.firstname = redmineUserData.firstname;
      accountDataToSave.lastname = redmineUserData.lastname;
      accountDataToSave.createdOn = redmineUserData.created_on;
      accountDataToSave.updatedOn = redmineUserData.updated_on;
      accountDataToSave.lastLoginOn = redmineUserData.last_login_on;
      accountDataToSave.passwdChangedOn = redmineUserData.passwd_changed_on;
      accountDataToSave.twofaScheme = redmineUserData.twofa_scheme;
      accountDataToSave.customFields = redmineUserData.custom_fields;
    }

    let account = await RedmineAccount.findOne({ userId: user._id });

    if (!account) {
      account = new RedmineAccount({
        userId: user._id,
        ...accountDataToSave
      });
    } else {
      Object.assign(account, accountDataToSave);
    }

    await account.save();

    try {
      await performRedmineLogin(account);
      res.json({ success: true, message: "Login Redmine success!" });
    } catch (err: any) {
      if (err.message === REDMINE_AUTHEN_ERROR.INVALID_CREDENTIALS) {
        return res.status(401).json({ message: "Wrong Redmine account or password." });
      }
      throw err;
    }

  } catch (error: any) {
    console.error("Setup Redmine Account Error:", error.message);
    res.status(500).json({ message: "Config Redmine failed. Please try again later." });
  }
};

export const performRedmineLogin = async (accountDoc: any) => {
  const loginUrl = `${accountDoc.redmineUrl}/login`;

  const decryptedBytes = CryptoJS.AES.decrypt(accountDoc.password, ENCRYPT_SECRET);
  const plainPassword = decryptedBytes.toString(CryptoJS.enc.Utf8);

  if (!plainPassword) {
    throw new Error(REDMINE_AUTHEN_ERROR.DECRYPTION_FAILED);
  }

  // Get CSRF Token
  const getPageRes = await axios.get(loginUrl);
  const rawCookies = getPageRes.headers['set-cookie'] || [];
  const initCookieStr = rawCookies.map((c: any) => c.split(';')[0]).join('; ');
  const $ = cheerio.load(getPageRes.data);
  const authenticity_token = $('input[name="authenticity_token"]').val();

  // Post Login
  const formData = qs.stringify({
    utf8: '✓',
    authenticity_token,
    username: accountDoc.username,
    password: plainPassword,
    login: 'Login'
  });

  try {
    await axios.post(loginUrl, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': initCookieStr,
        'User-Agent': 'Mozilla/5.0...'
      },
      maxRedirects: 0
    });
    // If response status 200 -> login fail (Redmine return form login error)
    throw new Error(REDMINE_AUTHEN_ERROR.INVALID_CREDENTIALS);
  } catch (error: any) {
    // Redmine 302 -> Success
    if (error.response && error.response.status === 302) {
      const authCookies = error.response.headers['set-cookie'];
      const newCookie = authCookies.map((c: string) => c.split(';')[0]).join('; ');

      // Cập nhật Database
      accountDoc.sessionCookie = newCookie;
      accountDoc.lastLogin = new Date();
      await accountDoc.save();

      return newCookie;
    }
    throw error;
  }
};

export const getUsersFromReportHTML = async (req: any, res: any) => {
  try {
    const account = req.redmineAccount;

    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Please link your Redmine Account first." });
    }

    const reportUrl = `${account.redmineUrl}/time_entries/report?criteria%5B%5D=project&set_filter=1&sort=spent_on%3Adesc&f%5B%5D=spent_on&op%5Bspent_on%5D=m&f%5B%5D=user_id&op%5Buser_id%5D=%3D&v%5Buser_id%5D%5B%5D=me&f%5B%5D=&group_by=&t%5B%5D=hours&t%5B%5D=&columns=week&criteria%5B%5D=&encoding=ISO-8859-1`;

    const response = await res.fetchRedmine(reportUrl);

    const $ = cheerio.load(response.data);
    let userList: any[] = [];

    $('script').each((i, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && scriptContent.includes('var availableFilters =')) {
        const match = scriptContent.match(/var availableFilters = (\{.*?\});/);

        if (match && match[1]) {
          try {
            const filters = JSON.parse(match[1]);
            const rawUsers = filters.user_id?.values || [];

            rawUsers.forEach((u: any[]) => {
              const name = u[0];
              const id = u[1];
              const status = u[2] || 'unknown';

              if (id !== "me" && id !== "4" && !name.includes("<<")) {
                userList.push({ id, name, status });
              }
            });
          } catch (e) {
            console.error("Failed to parse JSON from script", e);
          }
        }
      }
    });

    userList.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });

    res.json({
      success: true,
      count: userList.length,
      users: userList
    });

  } catch (error: any) {
    // Catch MIDDLEWARE errorand throw to FRONTEND for force user to login again
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({
        message: "Your Redmine login session has expired and cannot be automatically restored (you may have changed your password). Please log in to Redmine again."
      });
    }

    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "Bạn chưa thiết lập tài khoản Redmine." });
    }

    console.error("Scrape User Error:", error.message);
    res.status(500).json({ message: "Lỗi khi bóc tách danh sách user từ HTML" });
  }
};

export const getNewTaskOptions = async (req: any, res: any) => {
  try {
    const { project_id } = req.params;
    const { assigned_to_id, parent_issue_id, tracker_id } = req.query;
    const account = req.redmineAccount; // Đã được middleware gán vào

    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Vui lòng liên kết tài khoản Redmine." });
    }

    // 1. Dựng URL có chứa đầy đủ param để Redmine render form chuẩn xác nhất
    let targetUrl = `${account.redmineUrl}/projects/${project_id}/issues/new?`;

    // Gắn các query parameters nếu Frontend có truyền lên
    const params = new URLSearchParams();
    if (assigned_to_id) params.append('issue[assigned_to_id]', String(assigned_to_id));
    if (parent_issue_id) params.append('issue[parent_issue_id]', String(parent_issue_id));
    if (tracker_id) params.append('issue[tracker_id]', String(tracker_id));

    targetUrl += params.toString();

    // 2. Gọi qua Interceptor để tự lo Session & Retry
    const response = await res.fetchRedmine(targetUrl);
    const $ = cheerio.load(response.data);

    // Helper: Bóc tách <option> từ một <select> selector
    const extractOptions = (selector: string) => {
      const options: any[] = [];
      $(selector).find('option').each((i, el) => {
        const val = $(el).attr('value');
        const text = $(el).text().trim();
        // Bỏ qua các option rỗng (như "--- Vui lòng chọn ---")
        if (val) {
          options.push({ id: val, name: text });
        }
      });
      return options;
    };

    // 3. Gom nhặt dữ liệu các trường cơ bản
    const result: any = {
      trackers: extractOptions('#issue_tracker_id'),
      statuses: extractOptions('#issue_status_id'),
      priorities: extractOptions('#issue_priority_id'),
      assignees: extractOptions('#issue_assigned_to_id'),
      doneRatios: extractOptions('#issue_done_ratio'),
      customFields: {} // Nơi chứa Epic Type, WBS...
    };

    // 4. Tuyệt chiêu quét Custom Fields Động
    // Redmine thường đặt id cho custom fields bắt đầu bằng "issue_custom_field_values_"
    $('select[id^="issue_custom_field_values_"]').each((i, el) => {
      const selectId = $(el).attr('id');

      // Tìm nhãn (Label) mô tả cho cái Select này để biết nó là Epic Type hay WBS
      let labelText = $(`label[for="${selectId}"]`).text().trim();

      // Xóa dấu sao (*) bắt buộc nếu có
      labelText = labelText.replace('*', '').trim();

      if (labelText && selectId) {
        result.customFields[labelText] = {
          id: selectId.replace('issue_custom_field_values_', ''), // Trích xuất ra ID gốc của custom field
          options: extractOptions(`#${selectId}`)
        };
      }
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({ message: "Your Redmine login session has expired. Please log in again." });
    }
    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "You haven't set up a Redmine account yet." });
    }

    console.error("Fetch Task Options Error:", error.message);
    res.status(500).json({ message: "Lỗi khi lấy dữ liệu form tạo task" });
  }
};

export const getSpentTimeReport = async (req: any, res: any) => {
  try {
    const account = req.redmineAccount; // from middleware
    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Please link your Redmine Account first." });
    }

    // 1. Build URL from query params
    const {
      columns, // 'day', 'week', 'month', 'year'
      from,    // YYYY-MM-DD
      to,      // YYYY-MM-DD
      period, // 'w' (this week), 'lw' (last week), 'm' (this month), 'lm' (last month), 'y' (this year)
      project_id,
      user_id,
      criteria = 'project' // 'project', 'user', 'issue', 'activity'
    } = req.query;

    const reportParams = new URLSearchParams();
    reportParams.append('set_filter', '1');
    reportParams.append('criteria[]', criteria);
    reportParams.append('t[]', 'hours');

    reportParams.append('columns', columns || 'day'); // Default to day

    // Handle time filters
    reportParams.append('f[]', 'spent_on');
    if (from && to) {
      reportParams.append('op[spent_on]', '><');
      reportParams.append('v[spent_on][]', from);
      reportParams.append('v[spent_on][]', to);
    } else {
      reportParams.append('op[spent_on]', period || 'm'); // Default to this month
    }

    // Handle other filters
    if (project_id) {
      reportParams.append('f[]', 'project_id');
      reportParams.append('op[project_id]', '=');
      reportParams.append('v[project_id][]', project_id);
    }
    if (user_id) {
      reportParams.append('f[]', 'user_id');
      reportParams.append('op[user_id]', '=');
      reportParams.append('v[user_id][]', user_id);
    }

    const reportUrl = `${account.redmineUrl}/time_entries/report?${reportParams.toString()}`;

    // 2. Fetch HTML using the interceptor
    const response = await res.fetchRedmine(reportUrl);
    const $ = cheerio.load(response.data);

    // 3. Scrape the report table
    let reportTable = $('table.list.report'); // Use a more robust selector for report pages
    if (reportTable.length === 0) {
      // Fallback to a more generic selector if the specific one fails
      reportTable = $('table.list');
    }

    if (reportTable.length === 0) {
      // Add server-side logging for future debugging
      console.error("Could not find a report table in the HTML response from Redmine.");
      return res.json({ success: true, report: { headers: [], rows: [], totals: [] }, filters: {} });
    }

    const headers: string[] = [];
    reportTable.find('thead th').each((i, el) => {
      headers.push($(el).text().trim());
    });

    const rows: any[] = [];
    reportTable.find('tbody tr').each((i, tr) => {
      const $tr = $(tr);
      // Bỏ qua dòng total nếu nó có thể nằm trong tbody
      if ($tr.hasClass('total')) {
        return;
      }
      const cells = $tr.find('th, td');
      const rowValues: string[] = [];
      cells.each((j, cell) => {
        rowValues.push($(cell).text().trim());
      });
      rows.push({ group: rowValues[0], values: rowValues.slice(1) });
    });

    // Tách riêng logic tìm dòng Total để xử lý trường hợp nó nằm trong <tfoot>
    let totals: string[] = [];
    const totalRow = reportTable.find('tbody tr.total, tfoot tr').first();
    totalRow.find('th, td').each((j, cell) => {
      totals.push($(cell).text().trim());
    });
    // 4. Scrape available filters
    let availableFilters: any = {};
    $('script').each((i, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && scriptContent.includes('var availableFilters =')) {
        const match = scriptContent.match(/var availableFilters = (\{.*?\});/);
        if (match && match[1]) {
          try {
            const parsedFilters = JSON.parse(match[1]);
            Object.keys(parsedFilters).forEach(key => {
              if (parsedFilters[key]?.values) {
                availableFilters[key] = parsedFilters[key].values.map((v: any[]) => ({ name: v[0], id: v[1] }));
              }
            });
          } catch (e) {
            console.error("Failed to parse JSON from script", e);
          }
        }
      }
    });

    res.json({
      success: true,
      report: { headers, rows, totals },
      filters: availableFilters
    });

  } catch (error: any) {
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({ message: "Your Redmine login session has expired. Please log in again." });
    }
    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "You haven't set up a Redmine account yet." });
    }

    console.error("Get Spent Time Report Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ message: "Failed to fetch or parse spent time report from Redmine" });
  }
};

export const getSpentTimeReportFilters = async (req: any, res: any) => {
  try {
    const account = req.redmineAccount;
    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Please link your Redmine Account first." });
    }

    const reportUrl = `${account.redmineUrl}/time_entries/report`;

    // 1. Fetch HTML sử dụng interceptor (tự động kèm cookie & retry)
    const response = await res.fetchRedmine(reportUrl);
    const $ = cheerio.load(response.data);

    let availableFilters: any = {};
    const columns: any[] = [];
    const criterias: any[] = [];

    // =================================================================
    // BƯỚC 1: LẤY DANH SÁCH FILTERS TỪ BIẾN JAVASCRIPT
    // =================================================================
    $('script').each((i, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && scriptContent.includes('var availableFilters =')) {
        // Dùng Regex để tóm gọn object JSON được gán cho availableFilters
        const match = scriptContent.match(/var availableFilters\s*=\s*(\{.*?\});/);

        if (match && match[1]) {
          try {
            availableFilters = JSON.parse(match[1]);
          } catch (e) {
            console.error("Failed to parse availableFilters JSON", e);
          }
        }
      }
    });

    // =================================================================
    // BƯỚC 2: LẤY CÁC TÙY CHỌN CỘT THỜI GIAN (Details / Columns)
    // =================================================================
    $('#columns option').each((i, el) => {
      const val = $(el).attr('value');
      const text = $(el).text().trim();
      if (val) {
        columns.push({ id: val, name: text });
      }
    });

    // =================================================================
    // BƯỚC 3: LẤY CÁC TÙY CHỌN NHÓM DÒNG (Add / Criterias)
    // =================================================================
    $('#criterias option').each((i, el) => {
      const val = $(el).attr('value');
      const text = $(el).text().trim();
      if (val) {
        criterias.push({ id: val, name: text });
      }
    });

    // Trả về JSON sạch sẽ cho Frontend
    res.json({
      success: true,
      data: {
        filters: availableFilters, // Chứa list user, activity, project status...
        columns: columns,          // Chứa: year, month, week, day
        criterias: criterias       // Chứa: project, status, user, tracker...
      }
    });

  } catch (error: any) {
    // Bắt lỗi Middleware ném ra
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({ message: "Your Redmine login session has expired. Please log in again." });
    }
    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "You haven't set up a Redmine account yet." });
    }

    console.error("Get Spent Time Report Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ message: "Failed to fetch or parse spent time report from Redmine" });
  }
};

export const getRemoteFilterOptions = async (req: any, res: any) => {
  try {
    const { filter_name } = req.params;
    const account = req.redmineAccount;

    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Please link your Redmine." });
    }

    const targetUrl = `${account.redmineUrl}/queries/filter?type=TimeEntryQuery&name=${encodeURIComponent(filter_name)}`;

    // Fetch dữ liệu từ Redmine
    const response = await res.fetchRedmine(targetUrl);

    let options: any[] = [];

    // ==========================================
    // TRƯỜNG HỢP 1: REDMINE TRẢ VỀ JSON ARRAY
    // ==========================================
    if (Array.isArray(response.data)) {
      // Chuẩn hóa mảng: Biến mảng 1 chiều thành 2 chiều
      options = response.data.map((item: any) => {
        if (typeof item === 'string') {
          // Nếu là ['PS New', 'Maint'] -> Trả về ['PS New', 'PS New']
          return [item, item];
        }
        return item; // Nếu đã là [['Name', 'ID']] thì giữ nguyên
      });
    }
    // ==========================================
    // TRƯỜNG HỢP 2: REDMINE TRẢ VỀ CHUỖI HTML
    // ==========================================
    else if (typeof response.data === 'string') {
      const cleanHtml = response.data.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '');
      const $ = cheerio.load(cleanHtml);

      $('option').each((i, el) => {
        const val = $(el).attr('value');
        const text = $(el).text().trim();
        if (val) {
          options.push([text, val]);
        }
      });
    }

    res.json({ success: true, data: options });

  } catch (error: any) {
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({ message: "Your Redmine login session has expired. Please log in again." });
    }
    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "You haven't set up a Redmine account yet." });
    }
    console.error("Fetch Remote Filter Error:", error.message);
    res.status(500).json({ message: "Failed to fetch remote filter options from Redmine" });
  }
};
export const generateSpentTimeReport = async (req: any, res: any) => {
  try {
    const account = req.redmineAccount;

    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Vui lòng liên kết tài khoản Redmine." });
    }

    // Lấy nguyên cục Query String từ URL của request hiện tại (Tất cả sau dấu ?)
    const queryString = req.originalUrl.substring(req.originalUrl.indexOf('?'));
    if (!queryString || queryString === req.originalUrl) {
      return res.status(400).json({ message: "Thiếu tham số filter báo cáo" });
    }

    // Ghép URL gọi thẳng lên trang Báo cáo của Redmine
    const reportUrl = `${account.redmineUrl}/time_entries/report${queryString}`;

    // Gọi bằng Interceptor
    const response = await res.fetchRedmine(reportUrl);
    const $ = cheerio.load(response.data);

    // 1. Kiểm tra xem có dữ liệu không
    const table = $('#time-report');
    if (table.length === 0) {
      return res.json({ success: true, data: { headers: [], rows: [], totals: [] } });
    }

    // 2. Bóc tách Headers (Tiêu đề cột: Project, 2026-14, Total time...)
    const headers: string[] = [];
    table.find('thead th').each((i, el) => {
      headers.push($(el).text().trim());
    });

    // 3. Bóc tách các Dòng Dữ liệu
    const rows: any[] = [];
    table.find('tbody tr').not('.total').each((i, el) => {
      const name = $(el).find('td.name').text().trim();
      const hours: string[] = [];

      $(el).find('td.hours').each((j, td) => {
        hours.push($(td).text().trim()); // Nó sẽ gom chữ "1:00" hoặc ""
      });

      rows.push({ name, hours });
    });

    // 4. Bóc tách Dòng Tổng cộng (Grand Total) ở cuối
    const totals: string[] = [];
    table.find('tbody tr.total td.hours').each((i, el) => {
      totals.push($(el).text().trim());
    });

    res.json({
      success: true,
      data: { headers, rows, totals }
    });

  } catch (error: any) {
    if (error.message === REDMINE_AUTHEN_ERROR.RE_LOGIN_FAILED) {
      return res.status(401).json({ message: "Your Redmine login session has expired. Please log in again." });
    }
    if (error.message === REDMINE_AUTHEN_ERROR.REDMINE_NOT_LINKED) {
      return res.status(403).json({ message: "You haven't set up a Redmine account yet." });
    }

    console.error("Generate Report Error:", error.message);
    res.status(500).json({ message: "Lỗi khi trích xuất dữ liệu bảng báo cáo từ Redmine" });
  }
};

export const getProjectTaskTreeV2 = async (req: any, res: any) => {
  try {
    const account = req.redmineAccount;
    if (!account || !account.redmineUrl) {
      return res.status(403).json({ message: "Missing Redmine Configuration / Session" });
    }

    const { projectName, taskName, taskDate, onlyShowMyTasks } = req.query;
    const isOnlyMyTasks = onlyShowMyTasks === 'true';

    // =====================================================================
    // BƯỚC 1: LẤY DANH SÁCH PROJECT TỪ API JSON
    // Cực kỳ nhanh, trả về thẳng ID số và Parent ID số chuẩn xác!
    // Vẫn gọi qua res.fetchRedmine để dùng Session Cookie
    // =====================================================================
    const projectsRes = await axios.get(`${account.redmineUrl}/projects.json`, {
      headers: { 'X-Redmine-API-Key': account.redmineApiKey },
      params: { status: REDMINE_PROJECT_STATUS.ACTIVE, limit: 1000 }
    });

    // MẸO: Nếu Redmine của bạn có nhiều hơn 100 project, API này cũng phân trang.
    // Tạm thời mình dùng limit=100, nếu thiếu bạn có thể viết vòng lặp lấy hết giống lúc cào Task.
    let allProjects = projectsRes.data.projects || [];
    const allProjectIds = new Set(allProjects.map((p: any) => p.id));

    // Tạo Map để lát cào HTML Task có thể dùng "Tên Project" tra ngược ra "ID Project"
    const projectNameToIdMap = new Map();
    allProjects.forEach((p: any) => projectNameToIdMap.set(p.name.trim(), p.id));

    // =====================================================================
    // BƯỚC 2: CÀO HTML TASK SONG SONG (CÓ PHÂN TRANG)
    // =====================================================================
    const globalTaskMap = new Map(); // Dùng Map để khử trùng lặp

    const fetchTasksForProject = async (projectIdentifier: string) => {
      // Hàm helper dùng chung để parse data từ 1 trang HTML
      const parsePageHTML = ($page: any) => {
        const rows = $page('table.issues tbody tr');
        if (rows.length === 0) return;

        rows.each((i: any, el: any) => {
          const $el = $page(el);
          const idText = $el.find('td.id a').text().trim();
          if (!idText) return;

          const id = parseInt(idText, 10);
          const subject = $el.find('td.subject a').text().trim();
          const status = $el.find('td.status').text().trim();

          // Lấy Parent ID an toàn bằng Regex
          const parentText = $el.find('td.parent').text().trim();
          const parentMatch = parentText.match(/\d+/);
          const parentId = parentMatch ? parseInt(parentMatch[0], 10) : null;

          const projNameHTML = $el.find('td.project').text().trim();
          const projectId = projectNameToIdMap.get(projNameHTML) || null;

          const isMine = $el.hasClass('assigned-to-me');

          // Lưu thẳng vào biến toàn cục globalTaskMap
          globalTaskMap.set(id, {
            id,
            subject,
            status: { name: status },
            parent: parentId ? { id: parentId } : null,
            project: { id: projectId, name: projNameHTML, identifier: projectIdentifier },
            isMine: isMine
          });
        });
      };

      try {
        // 1. FETCH TRANG ĐẦU TIÊN (Để mồi data và lấy tổng số trang)
        const firstPageUrl = `${account.redmineUrl}/projects/${projectIdentifier}/issues?set_filter=1&sort=id:desc&c[]=project&c[]=parent&c[]=tracker&c[]=subject&c[]=status&c[]=priority&c[]=assigned_to&per_page=100&page=1`;

        const firstResponse = await res.fetchRedmine(firstPageUrl);
        const $ = cheerio.load(firstResponse.data);

        // Parse data trang 1 luôn
        parsePageHTML($);

        // 2. TÍNH TỔNG SỐ TRANG
        // Tìm text dạng "(1-100/286)" để trích xuất con số 286
        const itemsText = $('.pagination .items').text().trim();
        let totalPages = 1;

        if (itemsText) {
          const match = itemsText.match(/\/(\d+)\)/); // Regex tìm con số sau dấu "/" và trước dấu ")"
          if (match && match[1]) {
            const totalItems = parseInt(match[1], 10);
            totalPages = Math.ceil(totalItems / 100); // Làm tròn lên (vd: 286/100 = 3 trang)
          }
        }

        // 3. FETCH SONG SONG CÁC TRANG CÒN LẠI (TỪ TRANG 2)
        if (totalPages > 1) {
          const pagePromises = [];

          for (let page = 2; page <= totalPages; page++) {
            const pageUrl = `${account.redmineUrl}/projects/${projectIdentifier}/issues?set_filter=1&sort=id:desc&c[]=project&c[]=parent&c[]=tracker&c[]=subject&c[]=status&c[]=priority&c[]=assigned_to&per_page=100&page=${page}`;

            // Tạo promise: Fetch -> Load Cheerio -> Parse
            const promise = res.fetchRedmine(pageUrl)
              .then((pageRes: any) => {
                const $page = cheerio.load(pageRes.data);
                parsePageHTML($page);
              })
              .catch((err: any) => {
                console.error(`Lỗi cào project ${projectIdentifier} page ${page}:`, err.message);
              });

            pagePromises.push(promise);
          }

          // Kích hoạt chạy đồng loạt tất cả các trang
          await Promise.all(pagePromises);
        }

      } catch (err: any) {
        console.error(`Lỗi cào project ${projectIdentifier} page 1:`, err.message);
      }
    };

    await Promise.all(allProjects.map((p: any) => fetchTasksForProject(p.identifier)));

    let allTasks = Array.from(globalTaskMap.values());

    // =====================================================================
    // BƯỚC 3: LỌC "ONLY SHOW MY TASKS" (ĐỆ QUY NGƯỢC GIỮ LẠI TASK CHA)
    // =====================================================================
    if (isOnlyMyTasks) {
      const keepTaskIds = new Set();

      const markToKeep = (taskId: number) => {
        if (keepTaskIds.has(taskId)) return;
        keepTaskIds.add(taskId);

        const task = globalTaskMap.get(taskId);
        if (task && task.parent && task.parent.id) {
          markToKeep(task.parent.id);
        }
      };

      allTasks.forEach(t => {
        if (t.isMine) markToKeep(t.id);
      });

      allTasks = allTasks.filter(t => keepTaskIds.has(t.id));
    }

    // =====================================================================
    // BƯỚC 4: TÌM KIẾM THEO TÊN / ID TASK
    // =====================================================================
    if (taskName) {
      const tSearch = String(taskName).toLowerCase();
      allTasks = allTasks.filter((t: any) =>
        t.subject.toLowerCase().includes(tSearch) || t.id.toString().includes(tSearch)
      );
    }

    // =====================================================================
    // BƯỚC 5: XÂY CÂY PROJECT & TASK TỪ MẢNG PHẲNG JSON
    // =====================================================================
    const buildTaskTree = (nodes: any[], parentId: number | null, allIdsInProject: Set<any>): any[] => {
      return nodes
        .filter((t: any) => {
          const pId = t.parent ? t.parent.id : null;
          return parentId === null
            ? (!t.parent || !allIdsInProject.has(t.parent.id))
            : (pId === parentId);
        })
        .map((t: any) => ({
          ...t,
          subtasks: buildTaskTree(nodes, t.id, allIdsInProject)
        }));
    };

    // Hàm đệ quy này giờ sẽ dùng p.id và p.parent.id (là số) lấy từ JSON
    const buildProjectTree = (parentId: number | null): any[] => {
      return allProjects
        .filter((p: any) => {
          const pId = p.parent ? p.parent.id : null;
          return parentId === null
            ? (!p.parent || !allProjectIds.has(p.parent.id))
            : (pId === parentId);
        })
        .map((project: any) => {
          // Map Task vào Project bằng ID số
          const projectTasks = allTasks.filter((t: any) => t.project.id === project.id);
          const projectTaskIds = new Set(projectTasks.map((t: any) => t.id));

          return {
            id: project.id,
            name: project.name,
            identifier: project.identifier,
            tasks: buildTaskTree(projectTasks, null, projectTaskIds),
            subProjects: buildProjectTree(project.id)
          };
        });
    };

    let projectTree = buildProjectTree(null);

    // Lọc đệ quy cây Project rỗng 
    if (projectName || isOnlyMyTasks || taskName) {
      const pSearch = projectName ? String(projectName).toLowerCase() : "";
      const filterProjectRecursive = (list: any[]): any[] => {
        return list
          .map(p => ({ ...p, subProjects: filterProjectRecursive(p.subProjects) }))
          .filter(p => {
            const matchesName = p.name.toLowerCase().includes(pSearch);
            const matchesId = p.id.toString().includes(pSearch);
            const hasTasks = p.tasks && p.tasks.length > 0;
            const hasMatchingChildren = p.subProjects && p.subProjects.length > 0;

            return (projectName && (matchesName || matchesId)) || hasMatchingChildren || hasTasks;
          });
      };
      projectTree = filterProjectRecursive(projectTree);
    }

    res.json(projectTree);

  } catch (error: any) {
    console.error("Scraping Tree Data Error:", error.message);
    res.status(500).json({ message: "Failed to scrape projects/tasks HTML" });
  }
};

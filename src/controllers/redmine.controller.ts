import { Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import qs from 'qs';
import CryptoJS from 'crypto-js';

import { REDMINE_AUTHEN_ERROR, REDMINE_LOG_TIME_ACTIVITY, REDMINE_PROJECT_STATUS, REDMINE_TASK_TRACKER_ID } from '../constants/redmine.js';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { getTotalLoggedHours, getISOYearAndWeek } from '../utils/redmineUtils.js';
import { RedmineAccount } from '../models/RedmineAccount.js';

const ENCRYPT_SECRET = process.env.REDMINE_PWD_SECRET || '';

export const logTime = async (req: any, res: Response) => {
  try {
    const { issue_id, hours, spent_on, comments, activity_id } = req.body;

    if (!issue_id || !hours || !spent_on) {
      return res.status(400).json({ message: "Missing required fields: issue_id, hours, or spent_on" });
    }

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user || !user.redmineApiKey || !user.redmineUrl) {
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
      `${user.redmineUrl}/time_entries.json`,
      logData,
      {
        headers: {
          "X-Redmine-API-Key": user.redmineApiKey,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(201).json({
      message: "Time logged successfully",
      data: response.data.time_entry
    });

  } catch (error: any) {
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const commonParams = {
      project_id: projectId,
      status_id: "open",
      limit: 1000,
      include: "custom_fields",
    };

    const [parentRes, myTasksRes] = await Promise.all([
      axios.get(`${user.redmineUrl}/issues.json`, {
        params: { ...commonParams, parent_id: "!*" },
        headers: { "X-Redmine-API-Key": user.redmineApiKey },
      }),
      axios.get(`${user.redmineUrl}/issues.json`, {
        params: { ...commonParams, assigned_to_id: "me" },
        headers: { "X-Redmine-API-Key": user.redmineApiKey },
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
          axios.get(`${user.redmineUrl}/issues/${id}.json`, {
            headers: { "X-Redmine-API-Key": user.redmineApiKey }
          }).catch(() => null)
        )
      );
      missingResponses.forEach((r: any) => {
        if (r?.data?.issue) {
          parentMap[r.data.issue.id] = r.data.issue.subject;
        }
      });
    }

    const today = new Date().toISOString().split('T')[0];

    const tasksWithDetails = await Promise.all(
      combinedIssues.map(async (issue: any) => {
        const loggedToday = await getTotalLoggedHours(user.redmineUrl, issue.id, today, user.redmineApiKey);

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

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });

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
      `${user.redmineUrl}/issues.json`,
      issueData,
      {
        headers: {
          "X-Redmine-API-Key": user.redmineApiKey,
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const response = await axios.get(`${user.redmineUrl}/enumerations/issue_priorities.json`, {
      headers: {
        "X-Redmine-API-Key": user.redmineApiKey,
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const response = await axios.get(`${user.redmineUrl}/enumerations/time_entry_activities.json`, {
      headers: {
        "X-Redmine-API-Key": user.redmineApiKey,
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const response = await axios.get(`${user.redmineUrl}/issue_statuses.json`, {
      headers: {
        "X-Redmine-API-Key": user.redmineApiKey,
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Calculate start date and end date of month
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

    const timeEntriesRes = await axios.get(`${user.redmineUrl}/time_entries.json`, {
      params: { user_id: "me", from: fromDate, to: toDate, limit: 1000 },
      headers: { "X-Redmine-API-Key": user.redmineApiKey }
    });

    const entries = timeEntriesRes.data.time_entries;
    const issueIds = [...new Set(entries.map((e: any) => e.issue?.id).filter((id: any) => id))];

    const issueMap: Record<number, string> = {};

    if (issueIds.length > 0) {
      const issuesRes = await axios.get(`${user.redmineUrl}/issues.json`, {
        params: { issue_id: issueIds.join(','), limit: 100 },
        headers: { "X-Redmine-API-Key": user.redmineApiKey }
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
        redmineUrl: user.redmineUrl
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    const response = await axios.post(`${user.redmineUrl}/issues.json`, {
      issue: {
        project_id: projectId,
        parent_issue_id: parentId,
        subject: subject,
        tracker_id: trackerId || REDMINE_TASK_TRACKER_ID.TASK.key,
        assigned_to_id: 'me' // Auto-assign to yourself
      }
    }, {
      headers: { 'X-Redmine-API-Key': user.redmineApiKey }
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });

    if (!user || !user.watchedProjectIds || user.watchedProjectIds.length === 0) {
      return res.json({ issues: [] });
    }

    // Lấy ngày hiện tại (định dạng YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];

    // 1. Lấy danh sách các task cha từ các project đang theo dõi
    const scanPromises = user.watchedProjectIds.map((projectId) =>
      axios.get(`${user.redmineUrl}/issues.json`, {
        params: {
          project_id: projectId,
          parent_id: "!*",
          status_id: "open",
          limit: 20,
        },
        headers: { "X-Redmine-API-Key": user.redmineApiKey },
      })
    );

    const results = await Promise.all(scanPromises);
    const allIssues = results.flatMap((response) => response.data.issues);

    const issuesWithLogCheck = await Promise.all(
      allIssues.map(async (issue: any) => {
        const loggedHours = await getTotalLoggedHours(
          user.redmineUrl,
          issue.id,
          today,
          user.redmineApiKey
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
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user || !user.redmineApiKey || !user.redmineUrl) {
      return res.status(400).json({ message: "Missing Redmine Configuration" });
    }

    const response = await axios.get(`${user.redmineUrl}/projects.json`, {
      headers: { 'X-Redmine-API-Key': user.redmineApiKey },
      params: {
        status: REDMINE_PROJECT_STATUS.ACTIVE,
        limit: 1000,
        sort: "name:asc"
      },
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Redmine Proxy Error:", error.message);
    res.status(500).json({ message: "Không thể kết nối tới Redmine" });
  }
}

export const getUserInfo = async (req: any, res: Response) => {
  try {
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Lỗi lấy thông tin user" });
  }
}

export const getRedmineConfig = async (req: any, res: Response) => {
  try {
    const { redmineApiKey, redmineUrl, watchedProjectIds, namingTemplate } = req.body;
    const email = req.user.email;

    const updatedUser = await AuthorizedUser.findOneAndUpdate(
      { email },
      {
        redmineApiKey,
        redmineUrl,
        watchedProjectIds,
        namingTemplate
      },
      { new: true, upsert: true }
    );

    res.json({ message: "Configuration updated successfully", data: updatedUser });
  } catch (error) {
    console.error("Redmine Config Error:", error);
    res.status(500).json({ message: "Failed to save configuration" });
  }
}

export const getProjectTaskTree = async (req: any, res: Response) => {
  try {
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user || !user.redmineApiKey || !user.redmineUrl) {
      return res.status(400).json({ message: "Missing Redmine Configuration" });
    }

    const { projectName, taskName, taskDate } = req.query;

    // 1. Lấy TẤT CẢ Project (giới hạn 1000 là mức tối đa của Redmine API)
    const projectsRes = await axios.get(`${user.redmineUrl}/projects.json`, {
      headers: { 'X-Redmine-API-Key': user.redmineApiKey },
      params: { status: REDMINE_PROJECT_STATUS.ACTIVE, limit: 1000 }
    });

    const allProjects = projectsRes.data.projects;
    const allProjectIds = new Set(allProjects.map((p: any) => p.id));

    // 2. Lấy Task của User
    const taskParams: any = { assigned_to_id: "me", status_id: "*", limit: 1000 };
    if (taskDate) taskParams.created_on = taskDate;

    const tasksRes = await axios.get(`${user.redmineUrl}/issues.json`, {
      headers: { 'X-Redmine-API-Key': user.redmineApiKey },
      params: taskParams
    });

    let allMyTasks = tasksRes.data.issues;

    // --- CẢI TIẾN 1: Tìm kiếm Task theo ID hoặc Name ---
    if (taskName) {
      const tSearch = String(taskName).toLowerCase();
      allMyTasks = allMyTasks.filter((t: any) =>
        t.subject.toLowerCase().includes(tSearch) ||
        t.id.toString().includes(tSearch) // Tìm kiếm ID theo kiểu chứa chuỗi (86 nằm trong 8690)
      );
    }

    // --- Hàm dựng cây Task (Giữ nguyên logic của bạn nhưng tối ưu filter) ---
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
          const projectTasks = allMyTasks.filter((t: any) => t.project.id === project.id);
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

    // --- CẢI TIẾN 2: Lọc đệ quy cho Project (ID hoặc Name) ---
    if (projectName) {
      const pSearch = String(projectName).toLowerCase();

      const filterProjectRecursive = (list: any[]): any[] => {
        return list
          .map(p => ({
            ...p,
            subProjects: filterProjectRecursive(p.subProjects)
          }))
          .filter(p => {
            const matchesName = p.name.toLowerCase().includes(pSearch);
            const matchesId = p.id.toString().includes(pSearch); // Tìm kiếm ID project kiểu chứa chuỗi
            const hasTasks = p.tasks.length > 0;
            const hasMatchingChildren = p.subProjects.length > 0;

            return matchesName || matchesId || hasMatchingChildren || hasTasks;
          });
      };
      projectTree = filterProjectRecursive(projectTree);
    }

    res.json(projectTree);

  } catch (error: any) {
    console.error("Tree Data Error:", error.message);
    res.status(500).json({ message: "Không thể lấy cấu trúc cây dữ liệu" });
  }
};

export const setupRedmineAccount = async (req: any, res: Response) => {
  try {
    const { username, password, redmineUrl } = req.body;
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user || !username || !password || !redmineUrl) {
      return res.status(400).json({ message: "Please enter Company Redmine URL, Username, and Password for Redmine." });
    }

    let fetchedApiKey = "";
    try {
      // Gọi API mặc định của Redmine để lấy thông tin user hiện tại
      const currentUserRes = await axios.get(`${redmineUrl}/users/current.json`, {
        auth: {
          username: username,
          password: password
        }
      });
      // Lấy API Key từ response
      fetchedApiKey = currentUserRes.data?.user?.api_key || "";
    } catch (apiErr: any) { }

    const encryptedPassword = CryptoJS.AES.encrypt(password, ENCRYPT_SECRET).toString();

    let account = await RedmineAccount.findOne({ userId: user.id });
    if (!account) {
      account = new RedmineAccount({ userId: user.id, redmineUrl, username, password: encryptedPassword });
    } else {
      account.username = username;
      account.password = encryptedPassword;
      account.redmineUrl = redmineUrl;
    }

    user.redmineUrl = redmineUrl;
    if (fetchedApiKey) {
      user.redmineApiKey = fetchedApiKey;
    }
    await user.save();

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

import { Request, Response } from 'express';
import axios from 'axios';

import { REDMINE_LOG_TIME_ACTIVITY, REDMINE_PROJECT_STATUS, REDMINE_TASK_TRACKER_ID } from '../constants/redmine.js';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { getTotalLoggedHours } from '../utils/redmineUtils.js';

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
    const { project_id, subject, parent_issue_id, assigned_to_id, tracker_id } = req.body;

    if (!project_id || !subject) {
      return res.status(400).json({ message: "Project ID and Subject are required" });
    }

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const issueData = {
      issue: {
        project_id: project_id,
        subject: subject,
        parent_issue_id: parent_issue_id || null,
        assigned_to_id: assigned_to_id === "me" ? "me" : assigned_to_id,
        tracker_id: tracker_id || REDMINE_TASK_TRACKER_ID.TASK.key,
      }
    };

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
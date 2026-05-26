import { Request, Response } from 'express';

import { Visitor } from '../models/Visitors.js';
import { ApiUsage } from '../models/ApiUsage.js';

export const getSiteVisits = async (_req: Request, res: Response) => {
  try {
    const totalUnique = await Visitor.countDocuments();

    res.json({
      totalUnique,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to get visits",
    });
  }
}

export const countTotalUsage = async (req: Request, res: Response) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;

    const matchStage: any = {};

    if (endpoint) {
      matchStage.endpoint = endpoint;
    }

    const result = await ApiUsage.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
        },
      },
    ]);

    const total = result[0]?.total || 0;

    res.json({
      endpoint: endpoint || "ALL",
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to get usage",
    });
  }
}

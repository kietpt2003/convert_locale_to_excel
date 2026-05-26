import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import { createClient } from "redis";

import { Visitor } from "./models/Visitors.js";
import { ApiUsage } from "./models/ApiUsage.js";
import { shouldTrackEndpoint } from "./utils/shouldTrackEndpoint.js";
import adminRoutes from './routes/admin.routes.js';
import languageRoutes from './routes/languages.routes.js';
import agentRoutes from './routes/agent.routes.js';
import redmineRoutes from './routes/redmine.routes.js';
import authRoutes from './routes/auth.routes.js';
import statsRoutes from './routes/stats.routes.js';
import convertKeyRoutes from './routes/convertKey.routes.js'

const app = express();
const PORT = 3000;

dotenv.config();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

const DB_URL = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@${process.env.DB_CLUSTER_PATH}`;
const connect = mongoose.connect(DB_URL, { family: 4, dbName: process.env.DB_NAME });

connect.then((db) => {
  console.log("Connect server success");
});

export const getRedisClient = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
};

app.use(async (req, _res, next) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    if (ip) {
      const exists = await Visitor.exists({ ip });

      if (!exists) {
        await Visitor.create({ ip });
      }
    }

    next();
  } catch (err) {
    console.error("Track visit error:", err);
    next();
  }
});

app.use(async (req, _res, next) => {
  try {
    if (!shouldTrackEndpoint(req)) {
      return next();
    }

    const endpoint = req.path;
    const method = req.method;

    const date = new Date().toISOString().slice(0, 10);

    await ApiUsage.findOneAndUpdate(
      { endpoint, method, date },
      { $inc: { count: 1 } },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    next();
  } catch (err) {
    console.error("Track API usage error:", err);
    next();
  }
});

app.use('/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/languages', languageRoutes)
app.use('/api/agent', agentRoutes);
app.use('/api/redmine', redmineRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/convert-key', convertKeyRoutes);

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

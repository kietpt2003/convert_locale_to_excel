import { Request, Response } from 'express';

import Tunnel from '../models/Tunnel.js';

export const getAgentUrl = async (req: Request, res: Response) => {
  try {
    // Find tunnel with service: 'ai-agent'
    const tunnel = await Tunnel.findOne({ service: "ai-agent" });

    if (!tunnel) {
      return res.status(404).json({ message: "Server Chat Agent not found. Please contact Super Admin." });
    }

    const agentUrl = tunnel.url;

    // Ping server Chat
    try {
      const clientToken = req.headers.authorization?.split(" ")[1] || "";

      const pingRes = await fetch(`${agentUrl}/api/ping`, {
        method: 'GET',
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clientToken}`,
        },
        signal: AbortSignal.timeout(5000)
      });

      if (pingRes.ok) {
        return res.json({ url: agentUrl + '/api/chat' });
      } else {
        throw new Error("Server Chat Configure Error.");
      }
    } catch (pingErr) {
      return res.status(404).json({ message: "Server Chat is currently under maintenance or has lost connection." });
    }

  } catch (err) {
    return res.status(404).json({ message: "Server Chat is currently under maintenance or has lost connection." });
  }
}
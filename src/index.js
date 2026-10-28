import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.routes.js";
import meRoutes from "./routes/me.routes.js";
import applicationsRoutes from "./routes/applications.routes.js";
import matchJobsRoutes from "./routes/matchJobs.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { startWorker } from "./services/worker.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/applications", applicationsRoutes);
app.use("/match-jobs", matchJobsRoutes);
app.use("/stats", statsRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Job Match Tracker API listening on http://localhost:${PORT}`);
  startWorker();
});

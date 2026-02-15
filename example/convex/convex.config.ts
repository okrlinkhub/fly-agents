import { defineApp } from "convex/server";
import flyAgents from "@okrlinkhub/fly-agents/convex.config.js";

const app = defineApp();
app.use(flyAgents);

export default app;

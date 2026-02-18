import { defineApp } from "convex/server";
import flyAgents from "../../src/component/convex.config.js";
const app = defineApp();
app.use(flyAgents);

export default app;

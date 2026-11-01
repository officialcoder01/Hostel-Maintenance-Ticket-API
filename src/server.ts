import "dotenv/config";
import app from "./app.js";
import { startAssignmentExpirationJob } from "./jobs/assignment-expiration.job.js";

const port = Number(process.env.PORT) || 8080;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  startAssignmentExpirationJob();
});
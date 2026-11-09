import { connect } from "./models.js";
import { app } from "./app.js";
import { config } from "./config.js";
await connect();
app.listen(config.port, () => console.log("API ready on port " + config.port));

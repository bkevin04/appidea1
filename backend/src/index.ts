import { config } from "./config.js";
import { buildApp } from "./server.js";

const { app, generator } = buildApp({ config, logger: true });

app.listen({ port: config.port, host: "0.0.0.0" }).then(() => {
  app.log.info(`Content generator: ${generator.name}${generator.name === "anthropic" ? ` (${config.claudeModel})` : " (offline demo mode, set ANTHROPIC_API_KEY for real games)"}`);
  app.log.info(`Playground: http://localhost:${config.port}/`);
});

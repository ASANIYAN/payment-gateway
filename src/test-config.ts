import { config } from "./config";

console.log("Configuration test:\n");
console.log("Environment:", config.nodeEnv);
console.log("Port:", config.port);
console.log("Database:", config.database.url);
console.log("Bank API:", config.bank.url);
console.log("Log level:", config.logging.level);

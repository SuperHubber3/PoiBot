// Loaded before the framework so env vars and plugins are registered everywhere.
import { config } from "dotenv";
import "@sapphire/plugin-i18next/register";

config();

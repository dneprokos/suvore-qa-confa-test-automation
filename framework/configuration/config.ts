import * as dotenv from "dotenv";
import * as path from "path";
import Joi from "joi";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const configSchema = Joi.object({
  BASE_URL: Joi.string().uri().required(),
  HEADLESS_BROWSER: Joi.boolean().default(true),
  PORT: Joi.number().default(9000),
  OWNER_EMAIL: Joi.string().email().required(),
  OWNER_PASSWORD: Joi.string().required(),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().required(),

  NODE_ENV: Joi.string()
    .valid("development", "test", "staging", "production")
    .default("development"),
}).unknown();

const { error, value: config } = configSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export class Config {
  static readonly BASE_URL: string = config.BASE_URL;
  static readonly HEADLESS_BROWSER: boolean = config.HEADLESS_BROWSER;
  static readonly PORT: number = config.PORT;
  static readonly OWNER_EMAIL: string = config.OWNER_EMAIL;
  static readonly OWNER_PASSWORD: string = config.OWNER_PASSWORD;
  static readonly ADMIN_EMAIL: string = config.ADMIN_EMAIL;
  static readonly ADMIN_PASSWORD: string = config.ADMIN_PASSWORD;
  static readonly NODE_ENV: string = config.NODE_ENV;
}

/** Thrown when required configuration is missing. Never shown to users verbatim. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

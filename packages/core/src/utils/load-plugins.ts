/* eslint-disable @typescript-eslint/no-explicit-any */

import * as path from "path";
import Auto from "../auto";
import { ILogger } from "./logger";
import tryRequire from "./try-require";
import InteractiveInit from "../init";

export type IPluginConstructor = new (options?: any) => IPlugin;

/** A plugin to auto */
export interface IPlugin {
  /** The name to identify the plugin by */
  name: string;
  /** Called when running `auto init`. gives plugin ability to add custom init experience. */
  init?(initializer: InteractiveInit): void;
  /** Called when registering the plugin with auto */
  apply(auto: Auto): void;
}

/** Require a plugin and log where it was found. */
function requirePlugin(
  pluginPath: string,
  logger: ILogger,
  extendedLocation?: string
) {
  const plugin = tryRequire(pluginPath, extendedLocation);

  if (plugin) {
    logger.verbose.info(`Found plugin using: ${pluginPath}`);
  }

  return plugin as IPluginConstructor;
}

/** Try to load a plugin in various ways */
export default function loadPlugin(
  [pluginPath, options]: [string, any],
  logger: ILogger,
  extendedLocation?: string
): IPlugin | undefined {
  const isLocal =
    pluginPath.startsWith(".") ||
    pluginPath.startsWith("/") ||
    pluginPath.match(/^[A-Z]:\\/); // Support for windows paths

  /** Attempt to require a plugin */
  const attempt = (p: string) => requirePlugin(p, logger, extendedLocation);

  let plugin:
    | IPluginConstructor
    | {
        /** The plugin under the default export */
        default: IPluginConstructor;
      }
    | undefined;

  // Try requiring a path
  if (isLocal) {
    plugin = attempt(pluginPath);
  }

  // Try requiring a path from cwd
  if (!plugin && isLocal) {
    const localPath = path.join(process.cwd(), pluginPath);
    plugin = attempt(localPath);

    if (!plugin) {
      logger.log.warn(`Could not find plugin from path: ${localPath}`);
      return;
    }
  }

  // For pkg bundle
  if (!plugin) {
    const pkgPath = path.join(
      __dirname,
      "../../../../../plugins/",
      pluginPath,
      "dist/index.js"
    );
    plugin = attempt(pkgPath);
  }

  // For a user created plugin
  if (!plugin) {
    plugin = attempt(`auto-plugin-${pluginPath}`);
  }

  // Try importing official plugin
  if (!plugin) {
    plugin = attempt(path.join("@auto-it", pluginPath));
  }

  // Try importing canary version of plugin
  if (!plugin) {
    plugin = attempt(path.join("@auto-canary", pluginPath));
  }

  // Try requiring a package
  if (
    !plugin &&
    (pluginPath.includes("/auto-plugin-") ||
      pluginPath.startsWith("auto-plugin-") ||
      pluginPath.startsWith("@auto-it"))
  ) {
    plugin = attempt(pluginPath);
  }

  if (!plugin) {
    logger.log.warn(`Could not find plugin: ${pluginPath}`);
    return;
  }

  try {
    if ("default" in plugin && plugin.default) {
      // eslint-disable-next-line new-cap
      return new plugin.default(options);
    }

    return new (plugin as IPluginConstructor)(options);
  } catch (error) {
    logger.log.error(
      `Plugin at the following path encountered an error: ${pluginPath}`
    );
    throw error;
  }
}

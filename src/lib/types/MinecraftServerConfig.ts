import * as z from 'zod';
import { formControlfromZodSchema } from '../client/form';

/**
 * Define zod metadata
 */
declare module 'zod' {
	interface GlobalMeta {
		description?: string;
	}
}

/**
 * Zod schema for a Minecraft server configuration object.
 */
export const minecraftServerConfigSchema = z.object({
	'server-name': z
		.string()
		.refine((val) => !val.includes(';'), { message: 'Server name cannot contain semicolon (;)' })
		.default('Minecraft Server')
		.meta({
			description:
				'Used as the server name<br />Allowed values: Any string without semicolon symbol.'
		}),
	gamemode: z.enum(['survival', 'creative', 'adventure']).default('survival').meta({
		description:
			'Sets the game mode for new players.<br />Allowed values: "survival", "creative", or "adventure"'
	}),
	'force-gamemode': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.optional()
		.default(false)
		.meta({
			description:
				'force-gamemode=false (or force-gamemode is not defined in the server.properties) ' +
				'prevents the server from sending to the client gamemode values other than the gamemode ' +
				'value saved by the server during world creation even if those values are set in ' +
				'server.properties after world creation.<br /><br />force-gamemode=true forces the server ' +
				'to send to the client gamemode values other than the gamemode value saved by the ' +
				'server during world creation if those values are set in server.properties after ' +
				'world creation.<br />Allowed values: "true" or "false"'
		}),
	difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard']).default('easy').meta({
		description:
			'Sets the difficulty of the world.<br />Allowed values: "peaceful", "easy", "normal", or "hard"'
	}),
	'allow-cheats': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'If true then cheats like commands can be used.<br />Allowed values: "true" or "false"'
		}),
	'max-players': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.default(20)
		.meta({
			description:
				'The maximum number of players that can play on the server.<br />Allowed values: Any positive integer'
		}),
	'online-mode': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(true)
		.meta({
			description:
				'If true then all connected players must be authenticated to Xbox Live.<br />' +
				'Clients connecting to remote (non-LAN) servers will always require Xbox Live ' +
				'authentication regardless of this setting.<br />If the server accepts connections ' +
				"from the Internet, then it's highly recommended to enable online-mode.<br />" +
				'Allowed values: "true" or "false"'
		}),
	'allow-list': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'If true then all connected players must be listed in the separate allowlist.json file.<br />Allowed values: "true" or "false"'
		}),
	'server-port': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(65535))
		.default(19132)
		.meta({
			description:
				'Which IPv4 port the server should listen to.<br />Allowed values: Integers in the range [1, 65535]'
		}),
	'server-portv6': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(65535))
		.default(19133)
		.meta({
			description:
				'Which IPv6 port the server should listen to.<br />Allowed values: Integers in the range [1, 65535]'
		}),
	'enable-lan-visibility': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'Listen and respond to clients that are looking for servers on the LAN. This will cause ' +
				'the server to bind to the default ports (19132, 19133) even when `server-port` and ' +
				'`server-portv6` have non-default values. Consider turning this off if LAN discovery ' +
				'is not desirable, or when running multiple servers on the same host may lead to port ' +
				'conflicts.<br />Allowed values: "true" or "false"'
		}),
	'view-distance': z
		.preprocess((value) => Number(value), z.number().int().min(5))
		.default(32)
		.meta({
			description:
				'The maximum allowed view distance in number of chunks.<br />Allowed values: Positive integer equal to 5 or greater.'
		}),
	'tick-distance': z
		.preprocess((value) => Number(value), z.number().int().min(4).max(12))
		.default(6)
		.meta({
			description:
				'The world will be ticked this many chunks away from any player.<br />Allowed values: Integers in the range [4, 12]'
		}),
	'player-idle-timeout': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.default(30)
		.meta({
			description:
				'After a player has idled for this many minutes they will be kicked. If set to 0 then ' +
				'players can idle indefinitely.<br />Allowed values: Any non-negative integer.'
		}),
	'max-threads': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.default(8)
		.meta({
			description:
				'Maximum number of threads the server will try to use. If set to 0 or removed then it will use as many as possible.<br />Allowed values: Any positive integer.'
		}),
	'level-name': z
		.string()
		.refine((val) => !val.includes(';'), { message: 'Level name cannot contain semicolon (;)' })
		.default('Minecraft World')
		.meta({
			description:
				'Allowed values: Any string without semicolon symbol or symbols illegal for file name: /\\n\\r\\t\\f`?*\\\\<>|\\":'
		}),
	'level-seed': z.string().default('-7512197374568099503').meta({
		description: 'Use to randomize the world<br />Allowed values: Any string'
	}),
	'default-player-permission-level': z
		.enum(['visitor', 'member', 'operator'])
		.default('member')
		.meta({
			description:
				'Permission level for new players joining for the first time.<br />Allowed values: "visitor", "member", "operator"'
		}),
	'texturepack-required': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'Force clients to use texture packs in the current world<br />Allowed values: "true" or "false"'
		}),
	'content-log-file-enabled': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description: 'Enables logging content errors to a file<br />Allowed values: "true" or "false"'
		}),
	'compression-threshold': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(65535))
		.default(1)
		.meta({
			description:
				'Determines the smallest size of raw network payload to compress<br />Allowed values: 0-65535'
		}),
	'compression-algorithm': z.enum(['zlib', 'snappy']).default('zlib').meta({
		description:
			'Determines the compression algorithm to use for networking<br />Allowed values: "zlib", "snappy"'
	}),
	'server-authoritative-movement': z
		.enum(['client-auth', 'server-auth', 'server-auth-with-rewind', 'default'])
		.default('server-auth')
		.meta({
			description:
				'Allowed values: "client-auth", "server-auth", "server-auth-with-rewind"<br />' +
				'Changes the server authority on movement:<br />' +
				'"client-auth": Server has no authority and accepts all positions from the client.<br />' +
				'"server-auth": Server takes user input and simulates the Player movement but accepts ' +
				'the Client version if there is disagreement.<br />' +
				'"server-auth-with-rewind": The server will replay local user input and will push it ' +
				'to the Client so it can correct the position if it does not match. The clients will ' +
				'rewind time back to the correction time, apply the correction, then replay all the ' +
				"player's inputs since then. This results in smoother and more frequent corrections."
		}),
	'player-position-acceptance-threshold': z
		.preprocess((value) => Number(value), z.number())
		.default(0.5)
		.meta({
			description:
				'Only used with "server-auth-with-rewind".<br />This is the tolerance of ' +
				'discrepancies between the Client and Server Player position. This helps prevent ' +
				'sending corrections too frequently for non-cheating players in cases where the ' +
				'server and client have different perceptions about when a motion started. For example ' +
				'damage knockback or being pushed by pistons.<br />The higher the number, the more ' +
				'tolerant the server will be before asking for a correction. Values beyond 1.0 have ' +
				'increased chances of allowing cheating.'
		}),
	'player-movement-action-direction-threshold': z
		.preprocess((value) => Number(value), z.number().min(0).max(1))
		.default(0.85)
		.meta({
			description:
				"The amount that the player's attack direction and look direction can differ.<br />" +
				'Allowed values: Any value in the range of [0, 1] where 1 means that the direction ' +
				'of the players view and the direction the player is attacking must match exactly and ' +
				'a value of 0 means that the two directions can differ by up to and including 90 degrees.'
		}),
	'server-authoritative-block-breaking-pick-range-scalar': z
		.preprocess((value) => Number(value), z.number())
		.default(1.5)
		.meta({
			description:
				'If true, the server will compute block mining operations in sync with the client so ' +
				'it can verify that the client should be able to break blocks when it thinks it can.'
		}),
	'chat-restriction': z
		.enum(['None', 'Dropped', 'Disabled'])
		.default('None')
		.meta({
			description:
				'Allowed values: "None", "Dropped", "Disabled"<br />This represents the level of ' +
				'restriction applied to the chat for each player that joins the server.<br />"None" is ' +
				'the default and represents regular free chat.<br />"Dropped" means the chat messages are ' +
				'dropped and never sent to any client. Players receive a message to let them know the ' +
				'feature is disabled.<br />"Disabled" means that unless the player is an operator, the ' +
				'chat UI does not even appear. No information is displayed to the player.'
		}),
	'disable-player-interaction': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'If true, the server will inform clients that they should ignore other players when ' +
				'interacting with the world. This is not server authoritative.'
		}),
	'client-side-chunk-generation-enabled': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(true)
		.meta({
			description:
				'If true, the server will inform clients that they have the ability to generate visual ' +
				'level chunks outside of player interaction distances.'
		}),
	'block-network-ids-are-hashes': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(true)
		.meta({
			description:
				"If true, the server will send hashed block network ID's instead of id's that start " +
				"from 0 and go up.  These id's are stable and won't change regardless of other block changes."
		}),
	'disable-persona': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description: 'Internal Use Only'
		}),
	'disable-custom-skins': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				'If true, disable players customized skins that were customized outside of the ' +
				'Minecraft store assets or in game assets.  This is used to disable possibly ' +
				'offensive custom skins players make.'
		}),
	'server-build-radius-ratio': z
		.union([
			z.literal('Disabled'),
			z.preprocess((value) => Number(value), z.number().min(0).max(1))
		])
		.default('Disabled')
		.meta({
			description:
				'Allowed values: "Disabled" or any value in range [0.0, 1.0]<br />' +
				'If "Disabled" the server will dynamically calculate how much of the player\'s view ' +
				'it will generate, assigning the rest to the client to build.<br />' +
				"Otherwise from the overridden ratio tell the server how much of the player's view to " +
				'generate, disregarding client hardware capability.<br />' +
				'Only valid if client-side-chunk-generation-enabled is enabled'
		}),
	'allow-outbound-script-debugging': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				"Allows script debugger 'connect' command and script-debugger-auto-attach=connect mode."
		}),
	'allow-inbound-script-debugging': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.default(false)
		.meta({
			description:
				"Allows script debugger 'listen' command and script-debugger-auto-attach=listen mode."
		}),
	'script-debugger-auto-attach': z
		.enum(['disabled', 'connect', 'listen'])
		.default('disabled')
		.meta({
			description:
				'Attempt to attach script debugger at level load, requires that either inbound port or ' +
				'connect address is set and that inbound or outbound connections are enabled.<br />' +
				'"disabled" will not auto attach.<br />' +
				'"connect" server will attempt to connect to debugger in listening mode on the specified port.<br />' +
				'"listen" server will listen to inbound connect attempts from debugger using connect mode on the specified port.'
		}),

	'force-inbound-debug-port': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(65535))
		.optional()
		.meta({
			description:
				'Locks the inbound (listen) debugger port, if not set then default 19144 will be used. Required when using script-debugger-auto-attach=listen mode.'
		}),
	'script-debugger-auto-attach-connect-address': z.string().optional().meta({
		description:
			"When auto attach mode is set to 'connect', use this address in the form host:port. Required for script-debugger-auto-attach=connect mode."
	}),
	'script-debugger-auto-attach-timeout': z
		.preprocess((value) => Number(value), z.number().int().min(0))
		.optional()
		.meta({
			description: 'Amount of time to wait at world load for debugger to attach.'
		}),
	'script-watchdog-enable': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.optional()
		.meta({
			description: 'Enables the watchdog (default = true).'
		}),
	'script-watchdog-enable-exception-handling': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.optional()
		.meta({
			description:
				'Enables watchdog exception handling via the events.beforeWatchdogTerminate event (default = true).'
		}),
	'script-watchdog-enable-shutdown': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.optional()
		.meta({
			description:
				'Enables server shutdown in the case of an unhandled watchdog exception (default = true).'
		}),
	'script-watchdog-hang-exception': z
		.preprocess((value) => String(value).toLowerCase() === 'true', z.boolean())
		.optional()
		.meta({
			description:
				'Throws a critical exception when a hang occurs, interrupting script execution (default = true).'
		}),
	'script-watchdog-hang-threshold': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.optional()
		.meta({
			description: 'Sets the watchdog threshold for single tick hangs (default = 10000 ms).'
		}),
	'script-watchdog-spike-threshold': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.optional()
		.meta({
			description:
				'Sets the watchdog threshold for single tick spikes.<br />Warning is disabled if property left unset.'
		}),
	'script-watchdog-slow-threshold': z
		.preprocess((value) => Number(value), z.number().int().min(1))
		.optional()
		.meta({
			description:
				'Sets the wachdog threshold for slow scripts over multiple ticks.<br />Warning is disabled if property left unset.'
		}),
	'script-watchdog-memory-warning': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(2000))
		.optional()
		.meta({
			description:
				'Produces a content log warning when the combined memory usage exceeds the given threshold (in megabytes).<br />Setting this value to 0 disables the warning. (default = 100, max = 2000)'
		}),
	'script-watchdog-memory-limit': z
		.preprocess((value) => Number(value), z.number().int().min(1).max(2000))
		.optional()
		.meta({
			description:
				'Saves and shuts down the world when the combined script memory usage exceeds the given threshold (in megabytes).<br />Setting this value to 0 disables the limit. (default = 250, max = 2000)'
		})
});

/**
 * Type definition for a Minecraft server configuration object.
 */
export type MinecraftServerConfig = z.infer<typeof minecraftServerConfigSchema>;

/**
 * Type definition for a Minecraft server configuration key
 */
export type MinecraftServerConfigKey = keyof MinecraftServerConfig;

/**
 * Form control definitions for a Minecraft server configuration object
 */
export const minecraftServerConfigControls = Object.entries(minecraftServerConfigSchema.shape).map(
	([key, schema]) => formControlfromZodSchema(key, schema)
);

/**
 * Strip the `.default()` wrapper from a field schema, if it has one, so that a
 * missing key parses to `undefined` instead of falling back to its default.
 */
function withoutDefault(schema: z.ZodType): z.ZodType {
	// `unwrap()` is typed with Zod's core schema interface; cast back to the
	// classic one the rest of this module is written against.
	return schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodType) : schema;
}

type ConfigShape = typeof minecraftServerConfigSchema.shape;
type PartialConfigShape = { [K in keyof ConfigShape]: z.ZodOptional<ConfigShape[K]> };

const partialConfigShape = Object.fromEntries(
	Object.entries(minecraftServerConfigSchema.shape).map(([key, schema]) => [
		key,
		withoutDefault(schema).optional()
	])
) as PartialConfigShape;

/**
 * Partial Minecraft server configuration schema, for patch-style updates where
 * only the fields the caller sent may be written.
 *
 * `minecraftServerConfigSchema.partial()` cannot be used for this: `.partial()`
 * only wraps every field in `.optional()`, and `ZodDefault` still resolves a
 * missing key to its default. Parsing `{ 'max-players': 25 }` with it returns
 * *every* field — the one change plus the default of every other field — and
 * merging that back into server.properties resets all untouched settings.
 *
 * The defaults are stripped before the fields are made optional, so absent keys
 * stay absent while present keys keep their coercion and validation
 * (`Number(...)`, `String(...) === 'true'`, enums, min/max, ...).
 */
export const partialMinecraftConfigSchema = z.object(partialConfigShape);
